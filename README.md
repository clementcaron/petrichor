# Petrichor

Petrichor is a structural index for TypeScript repositories, built for coding agents. Instead of reading every file to understand a codebase, an agent runs one command to build the index and then asks precise structural questions: where is this symbol defined, what calls this function, what does this file import.

The primary use case is native integration into coding agent platforms (Claude Code, GitHub Copilot, OpenCode, Codex) via `petrichor hooks install`, which intercepts expensive file reads and substitutes compact structural responses automatically.

## Agent platform integration

```bash
petrichor index                 # build the index once (or after edits)
petrichor hooks install         # wire Petrichor into your active coding agent(s)
petrichor hooks install --dry-run  # preview what would be written
```

`hooks install` auto-detects active platforms in the current repo and writes the integration for each:

| Platform | Detection | Integration type |
|---|---|---|
| Claude Code | `.claude/` | Runtime hook — intercepts `Read` tool, substitutes capsule |
| OpenCode | `.opencode/` | Runtime hook — intercepts `Read` tool, substitutes capsule |
| GitHub Copilot | `.copilot/` | Instruction hook — injects guidance into agent config |
| Codex | `.codex/` | Instruction hook — injects guidance into agent config |

Once installed, the agent automatically receives a context capsule (filtered pivot source + skeletonized, filtered neighbors) whenever it reads an indexed TypeScript file. Each text payload is independently limited to 8 KiB and carries filtering metadata. Runtime hooks fall through only when Petrichor is unavailable, the Repository Index is missing, or the Repository Path is not indexed; structured security failures block the underlying read.

## Commands

| Command | What it does |
|---|---|
| `petrichor index [--full]` | Build or incrementally update the index. `--full` forces a complete rebuild. |
| `petrichor lookup <symbolName>` | Exact, case-sensitive symbol definition lookup. |
| `petrichor search <query>` | Exploratory ranked search over symbols and file paths. |
| `petrichor imports <repositoryPath>` | Outgoing repo-local import edges from a file. |
| `petrichor importers <repositoryPath>` | Incoming repo-local import edges to a file. |
| `petrichor callers <functionName>` | Direct callers of a named function across the repo. |
| `petrichor callees <functionName>` | Direct callees of a named function across the repo. |
| `petrichor capsule <repositoryPath>` | Filtered pivot source + skeletonized, filtered neighbor files for a path. |
| `petrichor session record --session <id>` | Record one structured Session Event supplied as JSON on stdin. |
| `petrichor session guide --session <id>` | Retrieve the current Session Guide for a Coding Session. |
| `petrichor hooks install [--dry-run]` | Install Petrichor into detected agent platforms. |

All commands output structured JSON. Every response includes `status: "ok" | "no_matches" | "partial" | "error"`. Failures emit valid JSON with a non-zero exit code.

Capsule filtering redacts documented high-confidence token formats, authorization values, credential-bearing URLs, PEM private keys, and static string values assigned to sensitive TypeScript names. It is a deterministic safeguard against accidental disclosure, not a guarantee that every secret is detected.

→ [Full JSON output reference](docs/INTERNALS.md#json-output-reference)

## Building from source

```bash
npm install     # install dependencies
npm run build   # compile TypeScript → dist/
npm test        # run tests with Node test runner
npm run check   # type-check without emitting
```

### Install the `petrichor` binary

```bash
npm link        # register petrichor in your global PATH (run once)
```

After linking, `petrichor` works in any directory. When you make changes, `npm run build` is enough — the symlink always points to `dist/`.

Run from source during development:

```bash
npm run dev -- index
npm run dev -- index --full
npm run dev -- lookup runIndexCommand
npm run dev -- search capsule
npm run dev -- imports src/commands/index.ts
npm run dev -- importers src/lib/database.ts
npm run dev -- callers lookupSymbols
npm run dev -- callees runLookupCommand
npm run dev -- capsule src/commands/calls.ts
npm run dev -- session guide --session agent-session-id
printf '%s' '{"type":"intent","summary":"Implement session memory"}' | npm run dev -- session record --session agent-session-id
npm run dev -- hooks install
npm run dev -- hooks install --dry-run
```

> `lookup`, `callers`, and `callees` take exact names. `search` takes free-form query text. `imports`, `importers`, and `capsule` take repo-relative file paths. Session commands take a caller-owned opaque ID. All commands operate on the **current working directory**.

---

→ [How it works under the hood](docs/INTERNALS.md)
