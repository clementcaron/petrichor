# Agent Guidelines

## Behavioral Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting (only if not asked).
Don't refactor what isn't broken. Match existing style.

### Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate (max iter: 5-7).
Strong success criteria let you loop independently.

### Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Do not commit
I prefer to commit myself — give me the diff and I'll review it. Examples of good commit messages:
- `fix: Fix cursor invisibility at start of big fraction`
- `feat: Implement snap-to-nearest cursor slot algorithm`
- `feat: Add GitHub Actions workflows for CI and Android release automation`
- `misc: Make Android release signing conditional on keystore presence`
- `fix: Parse and review Gradle problems report for build diagnostics`

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

### Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.
Join with Rule 8: Write tests before implementing.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left (in short).
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

### Security
Never hardcode secrets or sensitive information in code or config files. Use environment variables or secure vaults. Never commit secrets to version control, even in "example" or "bak" files.

---

## Project Stack & Commands

- **Runtime:** Node.js 24+
- **Package layout:** single-package npm repository
- **Language:** TypeScript
- **CLI entrypoint:** `src/cli.ts`
- **Built CLI output:** `dist/cli.js`
- **Parser:** TypeScript compiler API
- **Local storage:** SQLite via `better-sqlite3`
- **Index location:** `.petrichor/index.db`
- **Test runner:** Node test runner via `node --import tsx --test`

### Core commands

- `npm install`
- `npm run build`
- `npm test`
- `npm run check`
- `npm run dev -- index`
- `npm run dev -- lookup <symbolName>`

---

## Directory Structure

- `src/`
  - `cli.ts` — CLI entrypoint
  - `commands/` — top-level CLI commands
  - `lib/` — indexing, lookup, filesystem, compiler, and SQLite helpers
- `test/`
  - `cli.test.ts` — end-to-end CLI contract tests
  - `fixtures/repository/` — fixture Repository used by tests
- `docs/adr/`
  - `0001-first-runnable-slice.md` — current implementation contract
- `docs/architecture/`
  - target-state architecture notes that are **not** binding ADRs
- `.github/workflows/ci.yml` — build and test workflow

---

## Project Context

### Current shipped slice

Petrichor currently ships **Slice 1**: a repository-local CLI that builds a SQLite-backed Repository Index for `.ts` and `.tsx` files and performs exact, case-sensitive Definition Lookup by symbol name.

### Current capabilities

- `petrichor index` rebuilds the Repository Index atomically at `.petrichor/index.db`
- `petrichor lookup <symbolName>` returns structured JSON with exact matches in deterministic order
- Indexing respects `.gitignore`
- Indexing excludes `.d.ts`, common generated paths, and common test/spec paths
- Indexed symbol kinds are currently limited to: `class`, `enum`, `function`, `interface`, `type`, `variable`
- The CLI is machine-readable by default and tests lock the JSON contracts

### Current constraints

- TypeScript / TSX only
- Symbol table only; no relationship graph yet
- Manual full rebuild on each `index` run
- No JavaScript support yet
- No hooks/interception yet
- No snippets or skeletonized context output yet
- No session memory, global registry, or public library API yet

### Working rules for future slices

- Build **slice by slice** with each slice producing a working, testable user-facing capability
- Treat `docs/architecture/` as target-state guidance, not as the immediate implementation contract
- Record only real, current decisions in `docs/adr/`
- If a slice changes CLI behavior or JSON contracts, update both `README.md` and the CLI tests in the same change
- Prefer extending the current Node/TypeScript CLI until the next slice proves a stronger architecture is needed
