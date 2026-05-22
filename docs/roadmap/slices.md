# Petrichor slice roadmap

## Current state

- **Slice 1 is complete:** repo-local Node/TypeScript CLI with `index` and `lookup <symbolName>`
- **Slice 2 is complete:** repo-local import relationship queries with `imports <repositoryPath>` and `importers <repositoryPath>`
- **Slice 3 is complete:** repo-local caller/callee queries with `callers <functionName>` and `callees <functionName>`
- Current index is a SQLite-backed **Repository Index** for `.ts` / `.tsx` that stores symbols, repo-local static import relationships, and direct repo-local call relationships
- The product is intentionally still **CLI-first**, **repo-local**, and **machine-readable by default**

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

## Roadmap by slice

1. **Slice 4 — Context capsules**
   - Add a file-targeted `capsule <repositoryPath>` query
   - Return full pivot-file source plus grouped direct-neighbor summaries from existing import/call indexes
   - Goal: make Petrichor immediately useful inside real coding loops

2. **Slice 5 — Search and ranking**
   - Add FTS5-backed structural/text search and result ranking
   - Support cases where the agent knows a concept but not the exact symbol name
   - Goal: bridge exact lookup and exploratory navigation

3. **Slice 6 — Incremental indexing**
   - Add file hashing and fast incremental rebuilds
   - Optionally add watch mode after incremental correctness is proven
   - Goal: make repeated use fast enough for everyday inner-loop usage

4. **Slice 7 — Skeletonization output**
   - Emit compact symbol/file summaries instead of only raw lookup matches
   - Add skeletonized adjacent-code output to context capsules for agent consumption
   - Goal: start delivering token savings, not just navigation

5. **Slice 8 — Hook-assisted CLI integration**
   - Integrate Petrichor into agent tool loops via explicit wrappers or hooks
   - Intercept expensive reads and substitute Petrichor outputs where appropriate
   - Goal: make Petrichor feel native inside coding-agent workflows

6. **Slice 9 — Session memory**
   - Persist meaningful session events in local SQLite
   - Add structured rehydration / session guide behavior
   - Goal: reduce repeated work after context loss or restarts

7. **Slice 10 — Security harness**
   - Add explicit command boundaries and output filtering for noisy or risky data
   - Goal: keep agent context clean and predictable while preserving local-first operation

8. **Slice 11 — Global registry and cross-repo context**
   - Track multiple indexed repositories locally
   - Enable cross-repo lookups and context capsules
   - Goal: support real multi-repo development workflows

## Guiding rule

Each slice must deliver a **working product capability**, not just infrastructure. If a slice cannot be demonstrated end-to-end through the CLI, it is probably too large or too abstract.
