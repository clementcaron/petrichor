# How Petrichor works

Petrichor parses a TypeScript repository once, stores the extracted structure in a local SQLite database, and answers structural queries at sub-millisecond speed without re-reading source files on every question.

---

## File structure

```
petrichor/
├── src/
│   ├── cli.ts                  # entrypoint — argument parsing and command dispatch
│   ├── contracts.ts            # all public TypeScript types and JSON response shapes
│   ├── commands/
│   │   ├── index.ts            # `petrichor index` — orchestrates the indexing pipeline
│   │   ├── lookup.ts           # `petrichor lookup` — thin adapter over database lookup
│   │   ├── search.ts           # `petrichor search` — thin adapter over search module
│   │   ├── imports.ts          # `petrichor imports` / `importers` — thin adapters
│   │   ├── calls.ts            # `petrichor callers` / `callees` — thin adapters
│   │   ├── capsule.ts          # `petrichor capsule` — thin adapter over capsule module
│   │   ├── registry.ts         # `petrichor registry` — thin adapters over registry module
│   │   ├── hooks.ts            # `petrichor hooks install` — thin adapter over hooks module
│   │   └── session.ts          # `petrichor session` — thin adapters over session module
│   └── lib/
│       ├── database.ts         # Repository Index storage layer (SQLite reads + writes)
│       ├── compiler.ts         # TypeScript compiler API helpers (creates ts.Program)
│       ├── symbols.ts          # symbol and search-document extraction from AST nodes
│       ├── files.ts            # file discovery, .gitignore filtering, exclusion rules
│       ├── project.ts          # repo root detection and index path resolution
│       ├── hashing.ts          # SHA-256 content hashing for incremental indexing
│       ├── capsule.ts          # Context Capsule deep module (pivot + neighbor assembly)
│       ├── search.ts           # Search Query deep module (ranking, evidence, results)
│       ├── hooks.ts            # Hook Installer module (platform detection, config writing)
│       ├── session.ts          # Session Store and deterministic Session Guide folding
│       ├── registry.ts         # Global Registry and cross-Repository query orchestration
│       ├── skeleton.ts         # source skeletonization via AST text-range replacement
│       ├── output.ts           # JSON serialization helper (writeJson)
│       └── errors.ts           # error normalisation (PetrichorError, toCliError)
├── test/
│   ├── cli.test.ts             # CLI contract tests — primary guard for JSON output shapes
│   ├── capsule.test.ts         # module-interface tests for queryCapsule
│   ├── search.test.ts          # module-interface tests for runSearchQuery
│   ├── session.test.ts         # module-interface tests for Session Event recording and folding
│   └── fixtures/repository/   # small synthetic TypeScript repo used by all tests
├── docs/
│   ├── adr/                    # binding architectural decisions
│   ├── architecture/           # target-state design notes (not yet binding)
│   └── roadmap/                # slice-by-slice delivery plan
└── .petrichor/
    ├── index.db                # generated SQLite database (gitignored)
    ├── session.db              # generated Session Store (gitignored)
    └── hooks/
        ├── claude.sh           # runtime hook script for Claude Code (generated)
        └── opencode.sh         # runtime hook script for OpenCode (generated)
```

The user-scoped Global Registry is stored separately at `~/.petrichor/registry.db`.

---

## Module roles

### `src/commands/` — thin adapters

Each command module has a single exported `run*Command` function. It validates CLI arguments, calls into a lib module or `database.ts`, and writes the result with `writeJson`. No business logic lives here.

### `src/lib/database.ts` — the storage layer

All SQLite access goes through this module. It exposes:
- **`writeIndexDatabase`** — the write path: creates tables, runs the incremental-vs-full decision, writes symbols, import edges, call edges, and FTS search documents, then atomically renames the temp DB into place.
- **Per-query read adapters** — one function per structural query type. Each adapter runs a focused SQL query and maps rows to the contract types from `src/contracts.ts`.
- **`tokenizeSearchTerms`** — shared between write-time FTS document building and query-time evidence classification.

### `src/lib/hooks.ts` — the Hook Installer module

`installHooks(repoRoot, options)` owns everything behind `petrichor hooks install`:
1. Detects active platforms by checking for `.claude/`, `.opencode/`, `.copilot/`, `.codex/` in the repo root.
2. For **runtime hook** platforms (Claude Code, OpenCode): writes a shell script to `.petrichor/hooks/<platform>.sh` that intercepts file reads, runs `npx --no petrichor capsule <path>`, and blocks the read with the capsule response. Missing executables, `missing_index`, and `path_not_indexed` fall through; other structured Capsule Query failures block the direct read. Merges the hook entry into the platform's JSON config file.
3. For **instruction hook** platforms (GitHub Copilot, Codex): injects a natural language instruction block into the platform's instruction config file, directing the agent to prefer `petrichor capsule` over direct file reads.
4. Both paths are idempotent — re-running does not duplicate entries. `--dry-run` returns `action: "would_write"` without touching the filesystem.

### `src/lib/capsule.ts` — the Context Capsule deep module

`queryCapsule(indexPath, repositoryPath)` owns everything behind `petrichor capsule`:
1. Validates the Repository Path against the index and physically resolves every file immediately before reading it, rejecting paths outside the Repository with `path_outside_repository`.
2. Loads raw structural evidence (symbols, import edges, call edges) via `loadCapsuleEvidence`.
3. Accumulates neighbors, groups duplicate edges, and orders results deterministically (lexicographic by path).
4. Reads each neighbor's source and calls `skeletonizeSource` to strip function bodies.
5. Applies the mandatory Capsule Output Filter to the pivot source and every completed neighbor Skeleton.
6. Returns a `CapsuleResponse`.

`src/lib/capsule-filter.ts` owns the pure filtering policy. Redaction runs before deterministic head-and-tail UTF-8 truncation. The final size of each text payload, including the in-band truncation marker, is at most 8192 bytes. High-confidence detectors cover PEM private keys; GitHub, OpenAI, npm, and Slack token formats with enforced minimum lengths; Bearer and Basic authorization values; credentials in URLs; and static string values in supported TypeScript/TSX assignment contexts whose normalized identifier has a sensitive exact name or suffix. Generic prose and dynamic expressions are not structurally scanned. This reduces accidental disclosure but is not complete secret detection.

### `src/lib/search.ts` — the Search Query deep module

`runSearchQuery(indexPath, query)` owns everything behind `petrichor search`:
1. Tokenizes the query string.
2. Fetches FTS candidates via `fetchSearchCandidates` in `database.ts`.
3. Evaluates each candidate against evidence classes: `symbol_name` (exact/prefix/token), `repository_path` (exact/prefix/token), `source_text` (token).
4. Scores and sorts deterministically, structural evidence ranked above body-text hits.
5. Returns the top-10 results with machine-readable `SearchEvidence` per result.

### `src/lib/session.ts` — the session memory deep module

`recordSessionEvent(storePath, sessionId, event)` validates and appends one structured Session Event to `.petrichor/session.db`. `getSessionGuide(storePath, sessionId)` folds the latest intent and latest state per decision key, task key, Repository Path, and problem key into a deterministic Session Guide. Session persistence is separate from `index.db`, so reindexing cannot erase Coding Session state.

### `src/lib/registry.ts` — the Global Registry deep module

The module stores canonical Repository roots, reports current root/index availability, removes exact roots idempotently, aggregates `lookup --all` results, and resolves a selected Registered Repository for `capsule --repository`. Repository Indexes remain Repository-local; the registry stores no indexed source or structural relationships.

### `src/lib/skeleton.ts`

`skeletonizeSource(source)` takes raw TypeScript source as a string and returns it with all function, method, constructor, and accessor bodies replaced by `{}`. It uses the TypeScript compiler API to locate exact text ranges for body nodes, then does string replacement from right to left (so earlier offsets stay valid). Overload signatures and concise arrow-function expression bodies are left unchanged.

### `src/lib/compiler.ts` + `src/lib/symbols.ts`

`compiler.ts` creates a `ts.Program` from a list of file paths using default compiler options. `symbols.ts` walks the resulting AST to extract indexed symbols (top-level named declarations), import relationships, call relationships, and FTS search documents from each source file.

---

## What gets indexed

For each `.ts` / `.tsx` file in the repository (excluding `.d.ts`, generated paths, and test paths):

| Data | Table | Details |
|---|---|---|
| Top-level named declarations | `symbols` | `class`, `enum`, `function`, `interface`, `type`, `variable` |
| Static module edges | `import_relationships` | `import` and `export … from` statements; includes type-only and side-effect flags |
| Direct function-call edges | `call_relationships` | Resolved by TypeScript symbol resolution; only top-level named functions with bodies |
| FTS search documents | `search_documents` (FTS5) | One document per file: symbol names, file path segments, and source text tokens |
| File content hashes | `indexed_files` | SHA-256 of file content; used by incremental indexing to skip unchanged files |

Only **repo-local** edges are indexed. Calls to or imports from `node_modules` are ignored.

---

## Indexing pipeline

```
petrichor index
    ↓
files.ts        discover .ts/.tsx files, apply .gitignore + exclusion rules
    ↓
hashing.ts      SHA-256 each file; compare against indexed_files table
    ↓
compiler.ts     ts.createProgram over all files (always — needed for cross-file resolution)
    ↓
symbols.ts      walk AST per changed file → extract symbols, imports, calls, FTS docs
    ↓
database.ts     write to a temp copy of the DB, then atomic rename into .petrichor/index.db
```

The full `ts.createProgram` is always created even on incremental runs because TypeScript's cross-file call resolution requires the full type graph. Only the AST-walking and DB-write steps are skipped for unchanged files.

---

## Query execution

All queries run against the already-built `.petrichor/index.db`. No source files are read at query time except by `capsule`, which reads neighbor file source to produce skeletons.

| Command | How it works |
|---|---|
| `lookup` | `SELECT` from `symbols` by exact `name` match, ordered by `path` then `line` |
| `lookup --all` | list available Registered Repositories → exact lookup per Repository Index → deterministic combined ordering |
| `search` | FTS5 `MATCH` query → candidate scoring in `search.ts` → deterministic top-10 |
| `imports` | `SELECT` from `import_relationships` where `source_path = ?` |
| `importers` | `SELECT` from `import_relationships` where `target_path = ?` |
| `callers` | `SELECT` from `call_relationships` by callee name, resolved via TypeScript symbol names |
| `callees` | `SELECT` from `call_relationships` by caller name |
| `capsule` | multi-table join in `database.ts` → neighbor assembly in `capsule.ts` → `fs.readFile` per neighbor for skeletonization |
| `capsule --repository` | exact Registered Repository resolution → normal Capsule Query against the selected Repository Index |
| `registry list/remove` | read availability or delete one exact canonical root in `~/.petrichor/registry.db` |
| `session record` | validate one JSON event from stdin → append it to `.petrichor/session.db` |
| `session guide` | load one Coding Session → fold latest state per key/path in reverse event order |
| `hooks install` | directory checks for platform markers → config merge per platform → shell script write (runtime) or instruction file update (instruction) |

---

## JSON output reference

All commands output JSON to stdout. Every response includes a `status` field. Failures always emit valid JSON with a non-zero exit code.

### `petrichor index`

```json
{
  "status": "ok",
  "indexPath": ".petrichor/index.db",
  "fileCount": 8,
  "symbolCount": 6,
  "changedFileCount": 2,
  "skippedFileCount": 0,
  "skippedFiles": []
}
```

`changedFileCount` is how many files were added or modified in this run. First run (or `--full`) equals `fileCount`; unchanged re-runs return `0`. `status: "partial"` means some files failed; `skippedFiles` lists `{ path, reason }` entries.

### `petrichor lookup <symbolName>`

```json
{
  "query": "runIndexCommand",
  "status": "ok",
  "matchCount": 1,
  "matches": [
    {
      "name": "runIndexCommand",
      "kind": "function",
      "path": "src/commands/index.ts",
      "line": 14,
      "column": 23,
      "exported": true
    }
  ]
}
```

No matches → `status: "no_matches"`. Symbol kinds: `class | enum | function | interface | type | variable`.

### `petrichor lookup <symbolName> --all`

Returns the exact local match shape with `repositoryRoot` added to every match. Ordering is exported first, then `repositoryRoot`, Repository Path, line, and column. Unavailable entries appear in `skippedRepositories`; any skipped entry produces `status: "partial"` while at least one Repository is queried. No available Repositories produces `no_available_repositories` and a non-zero exit code.

### `petrichor registry list` and `registry remove <canonicalRoot>`

`registry list` returns `{ status, repositoryCount, repositories }`. Each repository has `repositoryRoot` and `availability`; unavailable entries also report `reason: "repository_missing" | "index_missing"`. `registry remove` returns `action: "removed" | "not_registered"` and is idempotent.

### `petrichor search <query>`

```json
{
  "query": "capsule",
  "status": "ok",
  "resultCount": 10,
  "results": [
    {
      "type": "symbol",
      "symbol": {
        "name": "CapsuleStatus",
        "kind": "type",
        "path": "src/contracts.ts",
        "line": 12,
        "column": 13,
        "exported": true
      },
      "evidence": [{ "field": "symbol_name", "match": "prefix" }]
    },
    {
      "type": "path",
      "path": "src/contracts.ts",
      "evidence": [{ "field": "symbol_name", "match": "prefix" }]
    }
  ]
}
```

Returns top-10 ranked results. Each result has `type: "symbol" | "path"` and machine-readable `evidence` (`field: symbol_name | repository_path | source_text`, `match: exact | prefix | token`). Structural evidence ranks above body-text hits.

### `petrichor imports <repositoryPath>`

```json
{
  "path": "src/consumers/UseUserService.ts",
  "status": "ok",
  "relationshipCount": 3,
  "relationships": [
    {
      "sourcePath": "src/consumers/UseUserService.ts",
      "targetPath": "src/models/UserShape.ts",
      "line": 1,
      "column": 32,
      "syntax": "import",
      "typeOnly": true,
      "sideEffect": false
    },
    {
      "sourcePath": "src/consumers/UseUserService.ts",
      "targetPath": "src/services/UserService.ts",
      "line": 2,
      "column": 29,
      "syntax": "import",
      "typeOnly": false,
      "sideEffect": false
    },
    {
      "sourcePath": "src/consumers/UseUserService.ts",
      "targetPath": "src/setup/bootstrap.ts",
      "line": 3,
      "column": 8,
      "syntax": "import",
      "typeOnly": false,
      "sideEffect": true
    }
  ]
}
```

`syntax` is `"import"` or `"re_export"`. No outgoing edges → empty `relationships` array. Path not in index → `status: "error"` with code `path_not_indexed`.

### `petrichor importers <repositoryPath>`

Same shape as `imports` with `sourcePath`/`targetPath` reversed — lists files that import the given path.

```json
{
  "path": "src/services/UserService.ts",
  "status": "ok",
  "relationshipCount": 2,
  "relationships": [
    {
      "sourcePath": "src/consumers/UseUserService.ts",
      "targetPath": "src/services/UserService.ts",
      "line": 2, "column": 29,
      "syntax": "import", "typeOnly": false, "sideEffect": false
    },
    {
      "sourcePath": "src/index.ts",
      "targetPath": "src/services/UserService.ts",
      "line": 1, "column": 29,
      "syntax": "re_export", "typeOnly": false, "sideEffect": false
    }
  ]
}
```

### `petrichor callers <functionName>`

```json
{
  "query": "sharedTarget",
  "status": "ok",
  "subjectCount": 1,
  "subjects": [
    {
      "name": "sharedTarget", "kind": "function",
      "path": "src/calls/SharedTarget.ts",
      "line": 1, "column": 17, "exported": true
    }
  ],
  "relationshipCount": 5,
  "relationships": [
    {
      "caller": {
        "name": "callSharedTwice", "kind": "function",
        "path": "src/calls/AliasCallers.ts",
        "line": 6, "column": 17, "exported": true
      },
      "callee": {
        "name": "sharedTarget", "kind": "function",
        "path": "src/calls/SharedTarget.ts",
        "line": 1, "column": 17, "exported": true
      },
      "callSite": { "line": 7, "column": 3 }
    }
  ]
}
```

`subjects` lists all indexed functions with that name (same name can exist in multiple files). No matches → `status: "no_matches"`. Known function with no callers → `status: "ok"` with empty `relationships`.

### `petrichor callees <functionName>`

Same shape as `callers` but reversed — lists functions that the named function calls.

```json
{
  "query": "callSharedTwice",
  "status": "ok",
  "subjectCount": 1,
  "subjects": [
    {
      "name": "callSharedTwice", "kind": "function",
      "path": "src/calls/AliasCallers.ts",
      "line": 6, "column": 17, "exported": true
    }
  ],
  "relationshipCount": 2,
  "relationships": [
    {
      "caller": {
        "name": "callSharedTwice", "kind": "function",
        "path": "src/calls/AliasCallers.ts",
        "line": 6, "column": 17, "exported": true
      },
      "callee": {
        "name": "sharedTarget", "kind": "function",
        "path": "src/calls/SharedTarget.ts",
        "line": 1, "column": 17, "exported": true
      },
      "callSite": { "line": 7, "column": 3 }
    }
  ]
}
```

### `petrichor capsule <repositoryPath>`

```json
{
  "path": "src/calls/AliasCallers.ts",
  "status": "ok",
  "pivot": {
    "source": "...filtered source of the pivot file...",
    "filtering": {
      "redactionCount": 0, "redactionCategories": [], "truncated": false,
      "originalByteCount": 1234, "outputByteCount": 1234, "omittedByteCount": 0
    }
  },
  "symbolCount": 4,
  "symbols": [
    {
      "name": "callSharedTwice", "kind": "function",
      "path": "src/calls/AliasCallers.ts",
      "line": 6, "column": 17, "exported": true
    }
  ],
  "neighborCount": 3,
  "neighbors": [
    {
      "path": "src/calls/SharedTarget.ts",
      "skeleton": "export function sharedTarget(): string {}\n\nfunction internalShared(): string {}\n",
      "filtering": {
        "redactionCount": 0, "redactionCategories": [], "truncated": false,
        "originalByteCount": 98, "outputByteCount": 98, "omittedByteCount": 0
      },
      "imports": [
        { "syntax": "import", "typeOnly": false, "sideEffect": false, "count": 2 }
      ],
      "importedBy": [],
      "callsTo": [
        {
          "caller": {
            "name": "callSharedTwice", "kind": "function",
            "path": "src/calls/AliasCallers.ts",
            "line": 6, "column": 17, "exported": true
          },
          "callee": {
            "name": "sharedTarget", "kind": "function",
            "path": "src/calls/SharedTarget.ts",
            "line": 1, "column": 17, "exported": true
          },
          "count": 2
        }
      ],
      "calledBy": []
    }
  ]
}
```

`pivot.source` is the filtered source of the queried file. Each neighbor includes a filtered `skeleton` (bodies stripped to `{}` first) plus grouped import/call relationship summaries. Every source field has adjacent `filtering` metadata, including no-op results. Redaction categories are `credential` and `private_key`; markers are `[REDACTED:credential]` and `[REDACTED:private-key]`. No neighbors → empty array. Path not indexed or physically outside the Repository → `status: "error"` with a non-zero exit code.

With `--repository <canonicalRoot>`, the response adds top-level `repositoryRoot` and otherwise retains the capsule shape. The selected root must be registered and available. Neighbor selection remains within that Repository Index.

### `petrichor session record --session <id>`

```json
{
  "status": "ok",
  "sessionId": "agent-42",
  "eventId": 1
}
```

The command reads exactly one JSON object from stdin. Supported event types are `intent`, `decision`, `task`, `file_change`, and `problem`.

### `petrichor session guide --session <id>`

```json
{
  "status": "ok",
  "sessionId": "agent-42",
  "guide": {
    "latestIntent": "Implement session memory",
    "decisions": [],
    "pendingTasks": [{ "key": "tests", "summary": "Run the full suite" }],
    "completedTasks": [],
    "changedFiles": [{ "path": "src/lib/session.ts", "summary": "Added Session Store" }],
    "openProblems": [],
    "resolvedProblems": []
  }
}
```

Unknown session IDs return `status: "no_matches"` with an empty guide.

### `petrichor hooks install [--dry-run] [--platform <name>]`

```json
{
  "status": "ok",
  "platforms": [
    {
      "platform": "claude",
      "hookType": "runtime",
      "configPath": ".claude/settings.json",
      "hookScript": ".petrichor/hooks/claude.sh",
      "action": "written"
    },
    {
      "platform": "copilot",
      "hookType": "instruction",
      "configPath": ".copilot/instructions.md",
      "hookScript": null,
      "action": "written"
    }
  ],
  "skipped": [
    { "platform": "opencode", "reason": "not_detected" },
    { "platform": "codex", "reason": "not_detected" }
  ]
}
```

`action` is `"written"` on a live run or `"would_write"` with `--dry-run`. Idempotent — re-running updates existing entries rather than duplicating them.
