# Petrichor slice roadmap

## Current state

**Slice 1 - repo-local Node/TypeScript CLI with `index` and `lookup <symbolName>`**
- Status: **complete**
- Added repo-local Node/TypeScript CLI with `index` and `lookup <symbolName>`

**Slice 2 — Direct relationship queries**
- Status: **complete**
- Added exact file-targeted Structural Queries: `imports <repositoryPath>` and `importers <repositoryPath>`
- Indexes repo-local static `import` and `export ... from` edges
- Includes type-only and side-effect relationships as explicit edge metadata
- Resolves repo-local targets with TypeScript compiler options
- Returns structured `path_not_indexed` errors for Repository Paths that are not present in the Repository Index

**Slice 3 — Caller / callee graph**
- Status: **complete**
- Added exact name-targeted Structural Queries: `callers <functionName>` and `callees <functionName>`
- Indexes direct repo-local function-call relationships for top-level named function declarations with bodies
- Resolves call targets through TypeScript symbol resolution, including aliases, namespace access, and re-exported functions
- Returns `no_matches` for absent function names and `ok` with zero relationships for isolated query subjects

**Slice 4 — Context capsules**
- Status: **complete**
- Added exact file-targeted Structural Query: `capsule <repositoryPath>`
- Returns full pivot-file source plus indexed top-level symbols for the pivot file
- Groups direct Neighbor File evidence from existing import and call relationships instead of replaying raw edge rows
- Returns `ok` with zero neighbors for indexed isolated files and structured `path_not_indexed` errors for missing Repository Paths

**Slice 5 — Search and ranking**
- Status: **complete**
- Added exploratory Structural Query: `search <query>`
- Indexes mixed structural and source-text search documents for the existing `.ts` / `.tsx` Repository Index
- Returns a deterministic top-10 global ranked result set with mixed Symbol-anchored and Repository Path-anchored hits
- Exposes machine-readable search evidence instead of raw relevance scores and keeps `lookup` as the exact Definition Lookup command

**Mid-project architecture hardening**
- Status: **complete**
- Extracted a deep Context Capsule module (`src/lib/capsule.ts`) that owns pivot source loading, raw structural evidence collection via a capsule-specific Repository Index adapter, Neighbor File assembly, grouping, and deterministic ordering; `src/commands/capsule.ts` is now a thin adapter
- Extracted a deep Search Query module (`src/lib/search.ts`) that owns tokenization, candidate evaluation, Search Evidence classification, ranking, and result shaping; the SQLite FTS storage adapter (`fetchSearchCandidates` in `database.ts`) provides candidate retrieval only; `src/commands/search.ts` is now a thin adapter
- Added module-interface test suites (`test/capsule.test.ts`, `test/search.test.ts`) that test at the module seam, complementing the existing CLI contract tests
- No CLI contracts or JSON response shapes were changed

**Slice 6 — Incremental indexing**
- Status: **complete**
- `petrichor index` now rebuilds only changed files using SHA-256 content hashing; `--full` forces a complete rebuild
- `IndexResponse` gains `changedFileCount` reporting how many files were added or modified
- Hash-gated full `ts.createProgram` strategy preserves cross-file call resolution correctness without a TypeScript builder API
- Atomicity preserved: existing DB is copied to a temp path, updated transactionally, then atomically renamed

**Slice 7 — Skeletonization output**
- Status: **complete**
- Each `CapsuleNeighbor` in a `capsule` response now includes a `skeleton` string: the neighbor file's source with function, method, constructor, and accessor bodies replaced with `{}`
- Pivot File remains full raw source; skeletonization applies to Neighbor Files only
- Implemented via TypeScript compiler API text-range replacement in `src/lib/skeleton.ts`; no new dependency introduced

**Slice 8 - Hook-assisted CLI integration**
- Status: **complete**
- Added `petrichor hooks install [--dry-run] [--platform <name>]` command to auto-detect active agent platforms and write integration files
- Added **Runtime hooks** for Claude Code (`.claude/`) and OpenCode (`.opencode/`): Hook Script at `.petrichor/hooks/<platform>.sh` intercepts single-file reads, blocks them, and substitutes a Context Capsule response; falls through if the file is not indexed
- Added **Instruction hooks** for GitHub Copilot (`.github/copilot-instructions.md`) and Codex (`AGENTS.md`): injects natural language instructions directing the agent to prefer `petrichor capsule`. Instruction hooks always install (no detection dir required).
- Hook Scripts invoke petrichor via `npx --no petrichor`; installer merges with existing platform config and is idempotent
- JSON response includes `platforms` (written entries with `hookType`, `configPath`, `hookScript`, `action`) and `skipped` (undetected platforms with `reason`)

**Slice 9 — Session memory**
- Status: **complete**
- Added `session record --session <id>` to append one structured Session Event supplied as JSON on stdin
- Added `session guide --session <id>` to fold the latest intent, decisions, task states, file changes, and problem states into deterministic JSON
- Stores Coding Sessions in `.petrichor/session.db`, independently from Repository Index rebuilds
- Keeps session identity caller-owned and automatic capture, raw history, FTS retrieval, prompt injection, and provider resume behavior out of scope

## Roadmap by slice

1. **Slice 10 — Security harness**
   - Add explicit command boundaries and output filtering for noisy or risky data; output filtering hooks attach to the `queryCapsule` seam in `src/lib/capsule.ts`
   - Goal: keep agent context clean and predictable while preserving local-first operation

2. **Slice 11 — Global registry and cross-repo context**
   - Track multiple indexed repositories locally
   - Enable cross-repo lookups and context capsules
   - Goal: support real multi-repo development workflows

## Guiding rule

Each slice must deliver a **working product capability**, not just infrastructure. If a slice cannot be demonstrated end-to-end through the CLI, it is probably too large or too abstract.
