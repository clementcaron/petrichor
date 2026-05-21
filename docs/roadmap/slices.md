# Petrichor slice roadmap

## Current state

- **Slice 1 is complete:** repo-local Node/TypeScript CLI with `index` and `lookup <symbolName>`
- **Slice 2 is complete:** repo-local import relationship queries with `imports <repositoryPath>` and `importers <repositoryPath>`
- Current index is a SQLite-backed **Repository Index** for `.ts` / `.tsx` that stores symbols plus repo-local static import relationships
- The product is intentionally still **CLI-first**, **repo-local**, and **machine-readable by default**

**Slice 2 — Direct relationship queries**
- Status: **complete**
- Added exact file-targeted Structural Queries: `imports <repositoryPath>` and `importers <repositoryPath>`
- Indexes repo-local static `import` and `export ... from` edges
- Includes type-only and side-effect relationships as explicit edge metadata
- Resolves repo-local targets with TypeScript compiler options
- Returns structured `path_not_indexed` errors for Repository Paths that are not present in the Repository Index

## Roadmap by slice

1. **Slice 3 — Caller / callee graph**
   - Index direct function-call relationships for TypeScript
   - Add caller/callee queries for named functions
   - Goal: answer "who uses this?" without opening files manually

2. **Slice 4 — Context capsules**
   - Return compact multi-file context around a symbol or file
   - Combine a pivot file with adjacent structural summaries instead of raw bulk reads
   - Goal: make Petrichor immediately useful inside real coding loops

3. **Slice 5 — Search and ranking**
   - Add FTS5-backed structural/text search and result ranking
   - Support cases where the agent knows a concept but not the exact symbol name
   - Goal: bridge exact lookup and exploratory navigation

4. **Slice 6 — Incremental indexing**
   - Add file hashing and fast incremental rebuilds
   - Optionally add watch mode after incremental correctness is proven
   - Goal: make repeated use fast enough for everyday inner-loop usage

5. **Slice 7 — Skeletonization output**
   - Emit compact symbol/file summaries instead of only raw lookup matches
   - Define the first "context capsule" format for agent consumption
   - Goal: start delivering token savings, not just navigation

6. **Slice 8 — Hook-assisted CLI integration**
   - Integrate Petrichor into agent tool loops via explicit wrappers or hooks
   - Intercept expensive reads and substitute Petrichor outputs where appropriate
   - Goal: make Petrichor feel native inside coding-agent workflows

7. **Slice 9 — Session memory**
   - Persist meaningful session events in local SQLite
   - Add structured rehydration / session guide behavior
   - Goal: reduce repeated work after context loss or restarts

8. **Slice 10 — Security harness**
   - Add explicit command boundaries and output filtering for noisy or risky data
   - Goal: keep agent context clean and predictable while preserving local-first operation

9. **Slice 11 — Global registry and cross-repo context**
   - Track multiple indexed repositories locally
   - Enable cross-repo lookups and context capsules
   - Goal: support real multi-repo development workflows

## Guiding rule

Each slice must deliver a **working product capability**, not just infrastructure. If a slice cannot be demonstrated end-to-end through the CLI, it is probably too large or too abstract.
