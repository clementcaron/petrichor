# Slice 6 adds incremental indexing

Slice 6 extends `petrichor index` with SHA-256 content hashing so repeated runs only re-extract and re-write DB rows for files that changed, were added, or were removed since the last run. We chose a hash-gated full `ts.createProgram` over a TypeScript builder API because preserving the full program keeps cross-file call resolution correct without managing a second stateful artifact (`.tsbuildinfo`). Atomicity is preserved by copying the existing DB to a temp path, applying incremental updates in a single SQLite transaction, then atomically renaming the temp file to the final path — the same guarantee as the previous full-rebuild approach.

## Considered options

- **TypeScript builder API (`ts.createIncrementalProgram`)**: would genuinely save parse time but adds `.tsbuildinfo` state to manage and is harder to reverse. Deferred.
- **File-by-file isolation**: would lose cross-file call resolution. Rejected.

## Consequences

When a file changes, all rows where it appears as caller or callee in `call_relationships` are deleted. Rows where an unchanged caller references the changed file as a callee are temporarily absent until the next time the caller changes or `--full` is run. This is conservative (missing) rather than stale (wrong line numbers). `petrichor index --full` restores full correctness.
