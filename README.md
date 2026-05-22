# Petrichor

Petrichor is a repository-local CLI that helps a coding agent answer structural questions without opening every file. The current slice supports building a SQLite-backed Repository Index for TypeScript source files, looking up exact symbol definitions by name, querying repo-local import relationships by file path, and traversing direct repo-local caller/callee relationships by exact function name.

## Current slice

- `petrichor index`
- `petrichor lookup <symbolName>`
- `petrichor imports <repositoryPath>`
- `petrichor importers <repositoryPath>`
- `petrichor callers <functionName>`
- `petrichor callees <functionName>`

### Scope

- Indexes `.ts` and `.tsx` files in the current Repository
- Respects `.gitignore` and excludes common generated and test paths
- Stores the Repository Index at `.petrichor/index.db`
- Uses exact, case-sensitive Definition Lookup
- Resolves repo-local static import relationships, including re-exports, type-only imports, and side-effect imports
- Resolves direct repo-local function-call relationships for top-level named function declarations with bodies
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
npm run dev -- callers lookupSymbols
npm run dev -- callees runLookupCommand
```

All commands search the **current working directory**. `lookup`, `callers`, and `callees` take exact names; `imports` and `importers` take repo-relative file paths. In this repository, `runIndexCommand`, `runLookupCommand`, and `lookupSymbols` are real indexed functions; `UserService` and `sharedTarget` exist only inside the test fixture repository under `test/fixtures/`.

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

### `petrichor callers <functionName>`

Matching functions return:

```json
{
  "query": "sharedTarget",
  "status": "ok",
  "subjectCount": 1,
  "subjects": [
    {
      "name": "sharedTarget",
      "kind": "function",
      "path": "src/calls/SharedTarget.ts",
      "line": 1,
      "column": 17,
      "exported": true
    }
  ],
  "relationshipCount": 5,
  "relationships": [
    {
      "caller": {
        "name": "callSharedTwice",
        "kind": "function",
        "path": "src/calls/AliasCallers.ts",
        "line": 6,
        "column": 17,
        "exported": true
      },
      "callee": {
        "name": "sharedTarget",
        "kind": "function",
        "path": "src/calls/SharedTarget.ts",
        "line": 1,
        "column": 17,
        "exported": true
      },
      "callSite": {
        "line": 7,
        "column": 3
      }
    }
  ]
}
```

Absent function names return `status: "no_matches"`. Existing query subjects with no direct callers return `status: "ok"` with an empty `relationships` array.

### `petrichor callees <functionName>`

Matching functions return:

```json
{
  "query": "callSharedTwice",
  "status": "ok",
  "subjectCount": 1,
  "subjects": [
    {
      "name": "callSharedTwice",
      "kind": "function",
      "path": "src/calls/AliasCallers.ts",
      "line": 6,
      "column": 17,
      "exported": true
    }
  ],
  "relationshipCount": 2,
  "relationships": [
    {
      "caller": {
        "name": "callSharedTwice",
        "kind": "function",
        "path": "src/calls/AliasCallers.ts",
        "line": 6,
        "column": 17,
        "exported": true
      },
      "callee": {
        "name": "sharedTarget",
        "kind": "function",
        "path": "src/calls/SharedTarget.ts",
        "line": 1,
        "column": 17,
        "exported": true
      },
      "callSite": {
        "line": 7,
        "column": 3
      }
    }
  ]
}
```

Like `callers`, `callees` is exact and case-sensitive, aggregates across all matching query subjects, and returns `status: "error"` when the Repository Index is missing.
