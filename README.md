# Petrichor

Petrichor is a repository-local CLI that helps a coding agent answer structural questions without opening every file. The first runnable slice supports building a SQLite-backed Repository Index for TypeScript source files and looking up exact symbol definitions by name.

## First runnable slice

- `petrichor index`
- `petrichor lookup <symbolName>`

### Scope

- Indexes `.ts` and `.tsx` files in the current Repository
- Respects `.gitignore` and excludes common generated and test paths
- Stores the Repository Index at `.petrichor/index.db`
- Uses exact, case-sensitive Definition Lookup
- Returns structured JSON by default

## Development

```bash
npm install
npm run build
npm test
```

Run the CLI from source during development:

```bash
npm run dev -- index
npm run dev -- lookup runIndexCommand
```

`lookup` searches the **current working directory**. In this repository, `runIndexCommand` is a real indexed symbol; `UserService` exists only inside the test fixture repository under `test/fixtures/`.

## JSON contracts

### `petrichor index`

Successful runs return:

```json
{
  "status": "ok",
  "indexPath": ".petrichor/index.db",
  "fileCount": 4,
  "symbolCount": 6,
  "skippedFileCount": 0,
  "skippedFiles": []
}
```

Partially successful runs use `status: "partial"` and populate `skippedFiles` with `{ "path", "reason" }` entries.

### `petrichor lookup <symbolName>`

Matches return:

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

No matches return `status: "no_matches"`. Execution failures still emit structured JSON with `status: "error"` and a failing exit code.
