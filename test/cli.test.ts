import { access, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { CallRelationshipsResponse, ImportRelationshipsResponse, IndexResponse, LookupResponse } from "../src/contracts";
import { runCli, withFixtureRepository } from "./helpers";

test("index returns ok when all candidate files parse successfully", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await rm(path.join(repositoryPath, "src", "broken"), { recursive: true, force: true });

    const result = await runCli<IndexResponse>(repositoryPath, "index");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.indexPath, ".petrichor/index.db");
    assert.equal(result.json.skippedFileCount, 0);
    assert.ok(result.json.fileCount > 0);
    assert.ok(result.json.symbolCount > 0);
    await access(path.join(repositoryPath, ".petrichor", "index.db"));
  });
});

test("index returns partial and reports parse failures without aborting", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<IndexResponse>(repositoryPath, "index");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "partial");
    assert.equal(result.json.skippedFileCount, 1);
    assert.deepEqual(result.json.skippedFiles, [{ path: "src/broken/Broken.ts", reason: "parse_error" }]);
    await access(path.join(repositoryPath, ".petrichor", "index.db"));
  });
});

test("lookup returns all exact matches in deterministic order", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<LookupResponse>(repositoryPath, "lookup", "UserService");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.matchCount, 2);
    assert.deepEqual(
      result.json.matches.map((match) => match.path),
      ["src/api/UserService.ts", "src/services/UserService.ts"],
    );
    assert.deepEqual(
      result.json.matches.map((match) => match.exported),
      [true, true],
    );
  });
});

test("lookup returns no_matches when the symbol is absent", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<LookupResponse>(repositoryPath, "lookup", "MissingSymbol");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "no_matches");
    assert.equal(result.json.matchCount, 0);
    assert.deepEqual(result.json.matches, []);
  });
});

test("lookup returns a structured error when the index is missing", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<LookupResponse>(repositoryPath, "lookup", "UserService");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "missing_index");
  });
});

test("lookup is case-sensitive and excludes declaration and test files", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const lowerCaseResult = await runCli<LookupResponse>(repositoryPath, "lookup", "userservice");
    const declarationResult = await runCli<LookupResponse>(repositoryPath, "lookup", "AmbientWidget");
    const testFileResult = await runCli<LookupResponse>(repositoryPath, "lookup", "TestOnlySymbol");

    assert.equal(lowerCaseResult.json.status, "no_matches");
    assert.equal(declarationResult.json.status, "no_matches");
    assert.equal(testFileResult.json.status, "no_matches");
  });
});

test("lookup includes named default exports and non-exported top-level symbols", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const namedDefaultResult = await runCli<LookupResponse>(repositoryPath, "lookup", "NamedDefaultService");
    const topLevelResult = await runCli<LookupResponse>(repositoryPath, "lookup", "buildCacheKey");

    assert.equal(namedDefaultResult.json.status, "ok");
    assert.deepEqual(namedDefaultResult.json.matches, [
      {
        name: "NamedDefaultService",
        kind: "function",
        path: "src/services/NamedDefaultService.ts",
        line: 1,
        column: 25,
        exported: true,
      },
    ]);

    assert.equal(topLevelResult.json.status, "ok");
    assert.deepEqual(topLevelResult.json.matches, [
      {
        name: "buildCacheKey",
        kind: "variable",
        path: "src/services/UserService.ts",
        line: 1,
        column: 7,
        exported: false,
      },
    ]);
  });
});

test("imports returns repo-local relationship records with alias, type-only, and side-effect metadata", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<ImportRelationshipsResponse>(repositoryPath, "imports", "src/consumers/UseUserService.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.path, "src/consumers/UseUserService.ts");
    assert.equal(result.json.relationshipCount, 3);
    assert.deepEqual(
      result.json.relationships.map((relationship) => ({
        sourcePath: relationship.sourcePath,
        targetPath: relationship.targetPath,
        line: relationship.line,
        syntax: relationship.syntax,
        typeOnly: relationship.typeOnly,
        sideEffect: relationship.sideEffect,
      })),
      [
        {
          sourcePath: "src/consumers/UseUserService.ts",
          targetPath: "src/models/UserShape.ts",
          line: 1,
          syntax: "import",
          typeOnly: true,
          sideEffect: false,
        },
        {
          sourcePath: "src/consumers/UseUserService.ts",
          targetPath: "src/services/UserService.ts",
          line: 2,
          syntax: "import",
          typeOnly: false,
          sideEffect: false,
        },
        {
          sourcePath: "src/consumers/UseUserService.ts",
          targetPath: "src/setup/bootstrap.ts",
          line: 3,
          syntax: "import",
          typeOnly: false,
          sideEffect: true,
        },
      ],
    );
    assert.ok(result.json.relationships.every((relationship) => Number.isInteger(relationship.column) && relationship.column > 0));
  });
});

test("importers returns incoming repo-local relationship records including re-exports", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<ImportRelationshipsResponse>(repositoryPath, "importers", "src/services/UserService.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.path, "src/services/UserService.ts");
    assert.equal(result.json.relationshipCount, 2);
    assert.deepEqual(
      result.json.relationships.map((relationship) => ({
        sourcePath: relationship.sourcePath,
        targetPath: relationship.targetPath,
        line: relationship.line,
        syntax: relationship.syntax,
        typeOnly: relationship.typeOnly,
        sideEffect: relationship.sideEffect,
      })),
      [
        {
          sourcePath: "src/consumers/UseUserService.ts",
          targetPath: "src/services/UserService.ts",
          line: 2,
          syntax: "import",
          typeOnly: false,
          sideEffect: false,
        },
        {
          sourcePath: "src/index.ts",
          targetPath: "src/services/UserService.ts",
          line: 1,
          syntax: "re_export",
          typeOnly: false,
          sideEffect: false,
        },
      ],
    );
    assert.ok(result.json.relationships.every((relationship) => Number.isInteger(relationship.column) && relationship.column > 0));
  });
});

test("imports returns ok with zero relationships for indexed files that have no edges", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<ImportRelationshipsResponse>(repositoryPath, "imports", "src/setup/bootstrap.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.relationshipCount, 0);
    assert.deepEqual(result.json.relationships, []);
  });
});

test("imports returns a structured error when the index is missing", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<ImportRelationshipsResponse>(repositoryPath, "imports", "src/services/UserService.ts");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "missing_index");
  });
});

test("imports returns a structured error when the target path is not indexed", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<ImportRelationshipsResponse>(repositoryPath, "imports", "src/types/global.d.ts");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "path_not_indexed");
  });
});

test("callers returns resolved direct call relationships across aliases, namespaces, barrels, and tsx files", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "sharedTarget");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.subjectCount, 1);
    assert.deepEqual(result.json.subjects, [
      {
        name: "sharedTarget",
        kind: "function",
        path: "src/calls/SharedTarget.ts",
        line: 1,
        column: 17,
        exported: true,
      },
    ]);
    assert.equal(result.json.relationshipCount, 5);
    assert.deepEqual(
      result.json.relationships.map((relationship) => ({
        caller: relationship.caller,
        callee: relationship.callee,
        callSite: relationship.callSite,
      })),
      [
        {
          caller: {
            name: "callSharedTwice",
            kind: "function",
            path: "src/calls/AliasCallers.ts",
            line: 6,
            column: 17,
            exported: true,
          },
          callee: {
            name: "sharedTarget",
            kind: "function",
            path: "src/calls/SharedTarget.ts",
            line: 1,
            column: 17,
            exported: true,
          },
          callSite: {
            line: 7,
            column: 3,
          },
        },
        {
          caller: {
            name: "callSharedTwice",
            kind: "function",
            path: "src/calls/AliasCallers.ts",
            line: 6,
            column: 17,
            exported: true,
          },
          callee: {
            name: "sharedTarget",
            kind: "function",
            path: "src/calls/SharedTarget.ts",
            line: 1,
            column: 17,
            exported: true,
          },
          callSite: {
            line: 8,
            column: 10,
          },
        },
        {
          caller: {
            name: "callThroughNamespace",
            kind: "function",
            path: "src/calls/AliasCallers.ts",
            line: 11,
            column: 17,
            exported: true,
          },
          callee: {
            name: "sharedTarget",
            kind: "function",
            path: "src/calls/SharedTarget.ts",
            line: 1,
            column: 17,
            exported: true,
          },
          callSite: {
            line: 12,
            column: 10,
          },
        },
        {
          caller: {
            name: "callThroughBarrel",
            kind: "function",
            path: "src/calls/AliasCallers.ts",
            line: 15,
            column: 17,
            exported: true,
          },
          callee: {
            name: "sharedTarget",
            kind: "function",
            path: "src/calls/SharedTarget.ts",
            line: 1,
            column: 17,
            exported: true,
          },
          callSite: {
            line: 16,
            column: 10,
          },
        },
        {
          caller: {
            name: "callFromTsx",
            kind: "function",
            path: "src/calls/TsxCallers.tsx",
            line: 7,
            column: 17,
            exported: true,
          },
          callee: {
            name: "sharedTarget",
            kind: "function",
            path: "src/calls/SharedTarget.ts",
            line: 1,
            column: 17,
            exported: true,
          },
          callSite: {
            line: 8,
            column: 10,
          },
        },
      ],
    );
  });
});

test("callees preserves repeated callsites for one caller", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CallRelationshipsResponse>(repositoryPath, "callees", "callSharedTwice");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.subjectCount, 1);
    assert.equal(result.json.relationshipCount, 2);
    assert.deepEqual(result.json.subjects, [
      {
        name: "callSharedTwice",
        kind: "function",
        path: "src/calls/AliasCallers.ts",
        line: 6,
        column: 17,
        exported: true,
      },
    ]);
    assert.deepEqual(
      result.json.relationships.map((relationship) => ({
        calleeName: relationship.callee.name,
        calleePath: relationship.callee.path,
        line: relationship.callSite.line,
        column: relationship.callSite.column,
      })),
      [
        {
          calleeName: "sharedTarget",
          calleePath: "src/calls/SharedTarget.ts",
          line: 7,
          column: 3,
        },
        {
          calleeName: "sharedTarget",
          calleePath: "src/calls/SharedTarget.ts",
          line: 8,
          column: 10,
        },
      ],
    );
  });
});

test("callers includes non-exported functions and excludes overload signatures without bodies", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const internalResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "internalShared");
    const overloadedResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "overloaded");

    assert.equal(internalResult.json.status, "ok");
    assert.deepEqual(internalResult.json.subjects, [
      {
        name: "internalShared",
        kind: "function",
        path: "src/calls/SharedTarget.ts",
        line: 5,
        column: 10,
        exported: false,
      },
    ]);
    assert.deepEqual(
      internalResult.json.relationships.map((relationship) => ({
        callerName: relationship.caller.name,
        callerPath: relationship.caller.path,
        callerExported: relationship.caller.exported,
        calleeExported: relationship.callee.exported,
      })),
      [
        {
          callerName: "usesInternalShared",
          callerPath: "src/calls/SharedTarget.ts",
          callerExported: true,
          calleeExported: false,
        },
      ],
    );

    assert.equal(overloadedResult.json.status, "ok");
    assert.equal(overloadedResult.json.subjectCount, 1);
    assert.deepEqual(overloadedResult.json.subjects, [
      {
        name: "overloaded",
        kind: "function",
        path: "src/calls/Overloads.ts",
        line: 3,
        column: 17,
        exported: true,
      },
    ]);
    assert.deepEqual(
      overloadedResult.json.relationships.map((relationship) => relationship.caller.name),
      ["callOverloaded"],
    );
  });
});

test("call queries return ok with zero relationships for isolated or excluded subjects", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const duplicateResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "duplicateSubject");
    const nestedResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callees", "outerWithNestedCall");
    const jsxResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "RenderTarget");

    assert.equal(duplicateResult.json.status, "ok");
    assert.equal(duplicateResult.json.subjectCount, 2);
    assert.equal(duplicateResult.json.relationshipCount, 0);
    assert.deepEqual(
      duplicateResult.json.subjects.map((subject) => subject.path),
      [
        "src/calls/collisions/DuplicateA.ts",
        "src/calls/collisions/DuplicateB.ts",
      ],
    );
    assert.deepEqual(duplicateResult.json.relationships, []);

    assert.equal(nestedResult.json.status, "ok");
    assert.equal(nestedResult.json.subjectCount, 1);
    assert.equal(nestedResult.json.relationshipCount, 0);
    assert.deepEqual(nestedResult.json.relationships, []);

    assert.equal(jsxResult.json.status, "ok");
    assert.equal(jsxResult.json.subjectCount, 1);
    assert.equal(jsxResult.json.relationshipCount, 0);
    assert.deepEqual(jsxResult.json.relationships, []);
  });
});

test("call queries include recursive self-calls", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CallRelationshipsResponse>(repositoryPath, "callees", "recursiveLoop");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.subjectCount, 1);
    assert.equal(result.json.relationshipCount, 1);
    assert.deepEqual(result.json.relationships, [
      {
        caller: {
          name: "recursiveLoop",
          kind: "function",
          path: "src/calls/SharedTarget.ts",
          line: 13,
          column: 17,
          exported: true,
        },
        callee: {
          name: "recursiveLoop",
          kind: "function",
          path: "src/calls/SharedTarget.ts",
          line: 13,
          column: 17,
          exported: true,
        },
        callSite: {
          line: 18,
          column: 10,
        },
      },
    ]);
  });
});

test("call queries return no_matches when the function name is absent or anonymous", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const missingResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "MissingFunction");
    const anonymousResult = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "AnonymousDefaultService");

    assert.equal(missingResult.exitCode, 0);
    assert.equal(missingResult.json.status, "no_matches");
    assert.equal(missingResult.json.subjectCount, 0);
    assert.equal(missingResult.json.relationshipCount, 0);
    assert.deepEqual(missingResult.json.subjects, []);
    assert.deepEqual(missingResult.json.relationships, []);

    assert.equal(anonymousResult.exitCode, 0);
    assert.equal(anonymousResult.json.status, "no_matches");
  });
});

test("call queries return a structured error when the index is missing", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<CallRelationshipsResponse>(repositoryPath, "callers", "sharedTarget");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "missing_index");
  });
});
