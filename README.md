# Petrichor

Petrichor is a repository-local CLI that helps a coding agent answer structural questions without opening every file. The current slice supports building a SQLite-backed Repository Index for TypeScript source files, looking up exact symbol definitions by name, and querying repo-local import relationships by file path.

## Current slice

- `petrichor index`
- `petrichor lookup <symbolName>`
- `petrichor imports <repositoryPath>`
- `petrichor importers <repositoryPath>`

### Scope

- Indexes `.ts` and `.tsx` files in the current Repository
- Respects `.gitignore` and excludes common generated and test paths
- Stores the Repository Index at `.petrichor/index.db`
- Uses exact, case-sensitive Definition Lookup
- Resolves repo-local static import relationships, including re-exports, type-only imports, and side-effect imports
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
npm run dev -- imports src/commands/index.ts
npm run dev -- importers src/lib/database.ts
```

All commands search the **current working directory**. `lookup` takes a symbol name; `imports` and `importers` take a repo-relative file path. In this repository, `runIndexCommand` is a real indexed symbol; `UserService` exists only inside the test fixture repository under `test/fixtures/`.

## JSON contracts

### `petrichor index`

Successful runs return:

```json
{
  "status": "ok",
  "indexPath": ".petrichor/index.db",
  "fileCount": 8,
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

### `petrichor imports <repositoryPath>`

Indexed files with outgoing repo-local edges return:

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

Indexed files with no outgoing edges still return `status: "ok"` with an empty `relationships` array. If the path is not present in the Repository Index, Petrichor returns `status: "error"` with code `path_not_indexed`.

### `petrichor importers <repositoryPath>`

Indexed files with incoming repo-local edges return:

```json
{
  "path": "src/services/UserService.ts",
  "status": "ok",
  "relationshipCount": 2,
  "relationships": [
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
      "sourcePath": "src/index.ts",
      "targetPath": "src/services/UserService.ts",
      "line": 1,
      "column": 29,
      "syntax": "re_export",
      "typeOnly": false,
      "sideEffect": false
    }
  ]
}
```

Like `imports`, `importers` returns `status: "ok"` with zero relationships for indexed files that have no matching edges and returns `status: "error"` when the target path is not indexed.
