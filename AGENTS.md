# AGENTS.md

## Behavioral Rules

These rules apply to every coding task. Skills own detailed workflow behavior; the rules below define repo-wide constraints and defaults.

### Rule 1 — Simplicity First

Solve the requested problem with the minimum code that works.
Do not add speculative features, abstractions, or cleanup outside the request.

### Rule 2 — Surgical Changes

Touch only what you must.
Keep changes local, match existing style and conventions, and do not refactor unrelated code.

### Rule 3 — Read Before You Write

Before changing behavior, read the nearby code, immediate callers, shared utilities, and relevant durable docs.
If the current structure is unclear, stop and surface the uncertainty before changing it.

### Rule 4 — Use TDD When the Seam Is Clear

Default to TDD for behavior changes when the expected outcome can be expressed through an existing or natural public seam.
Skip TDD for trivial mechanical edits, but never weaken or rewrite tests just to force a green result.
Tests should verify intent through meaningful behavior, not implementation details.

CLI contract tests are the primary guard for public JSON behavior. Module-interface tests cover deep modules such as Context Capsule and Search Query behavior.

### Rule 5 — Goal-Driven Execution

Define explicit success criteria, then iterate until they are verified.
Work independently, but stop and surface the blocker if progress stalls.
Do not exceed 5 implementation or debugging iterations without surfacing the issue.

### Rule 6 — Do Not Commit Automatically

Leave commits and history management to the user unless explicitly asked.

### Rule 7 — Surface Uncertainty and Conflicts Explicitly

If code, docs, or patterns conflict, pick the best-supported path, explain why, and flag the conflict.
Do not average contradictory patterns or claim completion when validation, scope, or behavior is uncertain.

For architecture conflicts, use this precedence: current code and tests, binding ADRs in `docs/adr/`, `CONTEXT.md`, then target-state notes in `docs/architecture/`. Architecture notes describe possible future design and are not an implementation contract.

### Rule 8 — Match the Codebase

Conformance to the repository's existing conventions beats personal preference.
If a convention seems harmful, surface it explicitly instead of silently introducing a competing pattern.

Use the domain terminology defined in `CONTEXT.md`. In particular, prefer Coding Agent, Repository, Repository Path, Repository Index, Structural Query, and Context Capsule over looser alternatives listed there.

## Project Context

- Project purpose: Petrichor is a local structural index and CLI that helps Coding Agents navigate TypeScript repositories with less context overhead.
- Primary domain / users: Coding Agents and developers who need precise symbol, import, call, search, and file-context queries over a local Repository.
- Repo shape: Single-package CLI application/library implementation.
- Main apps / services / packages: `src/cli.ts` is the CLI entrypoint; `src/commands/` contains thin command adapters; `src/lib/` contains indexing and Structural Query behavior; `src/contracts.ts` owns public JSON response types; `test/` contains CLI contracts, module-interface tests, and fixtures.
- Important durable docs: `CONTEXT.md` defines domain language and current module boundaries; `docs/adr/` contains binding decisions; `docs/INTERNALS.md` documents the implemented internals and JSON contracts; `docs/roadmap/slices.md` is the staged plan; `docs/architecture/` is non-binding target-state guidance.

## Tech Stack & Architecture

- Primary languages: TypeScript and TSX input support; implementation is TypeScript, with generated shell scripts for runtime hooks.
- Runtime / platform: Node.js 24+; local-first, offline CLI.
- Frameworks / major libraries: TypeScript compiler API for parsing and symbol resolution, `better-sqlite3` for SQLite/FTS5 storage, `ignore` for `.gitignore` handling, and `tsx` for development and tests.
- Package manager / build tools: npm, TypeScript compiler, Node test runner.
- Storage / infrastructure: Repository-local SQLite database at `.petrichor/index.db`; no external service or cloud dependency.
- Key architectural boundaries: `src/commands/` validates CLI input and emits JSON but should not own business logic; deep query modules such as `src/lib/capsule.ts` and `src/lib/search.ts` own use-case behavior; `src/lib/database.ts` owns Repository Index persistence and focused query adapters; `src/contracts.ts` defines public response shapes.

Current implementation constraints and invariants:

- The implementation indexes TypeScript and TSX repositories and exposes `index`, `lookup`, `search`, `imports`, `importers`, `callers`, `callees`, `capsule`, and `hooks install` commands.
- CLI output is machine-readable JSON with deterministic ordering. Failures must also emit valid JSON and return a non-zero exit code.
- If CLI behavior or a public JSON contract changes, update the relevant CLI tests and `README.md` in the same change.
- Build capabilities slice by slice. Extend the current Node/TypeScript CLI unless a binding decision establishes a different architecture.
- Do not implement target-state Rust, Tree-sitter, session-memory, or broader multi-language architecture merely because it appears in `docs/architecture/`.

## Validation & Commands

- Install: `npm install` for local development; `npm ci` for a clean lockfile-based install and CI.
- Dev: `npm run dev -- <command>`; examples include `npm run dev -- index`, `npm run dev -- lookup <symbolName>`, and `npm run dev -- hooks install --dry-run`.
- Build: `npm run build`.
- Test: `npm test`.
- Lint: none.
- Typecheck: `npm run build` (strict TypeScript compilation).
- Other important commands: `npm run check` runs build and tests; `petrichor index` refreshes the Repository Index; use `petrichor capsule <repositoryPath>` for TypeScript/TSX reads when indexed; use `petrichor hooks install --dry-run` before validating Hook Installer writes manually.

## Security

Never hardcode secrets or sensitive information in code or config files.
Use environment variables or the repository's secure configuration path.
Never commit secrets to version control, including example, backup, or temporary files.

Petrichor is local-first. Do not introduce network calls, cloud storage, or code uploads without an explicit product decision and user request.

## Agent skills

### Durable docs

Durable artifacts for this repo live in `CONTEXT.md`, `docs/adr/`, and `docs/roadmap/slices.md`. See `docs/agents/artifact-policy.md`.

### Temp artifacts

Transient artifacts live in the OS temp directory unless the user explicitly asks to keep them. See `docs/agents/artifact-policy.md`.

### Domain docs

This is a single-context Repository with root-level domain documentation. See `docs/agents/domain.md`.
