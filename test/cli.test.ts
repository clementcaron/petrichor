import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  CallRelationshipsResponse,
  CapsuleResponse,
  HooksInstallResponse,
  HooksUninstallResponse,
  ImportRelationshipsResponse,
  IndexResponse,
  LookupResponse,
  SearchResponse,
  SessionGuideResponse,
  SessionRecordResponse,
} from "../src/contracts";
import { runCli, runCliWithInput, withFixtureRepository } from "./helpers";

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
    assert.equal(result.json.changedFileCount, result.json.fileCount);
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

test("index --full forces a complete rebuild and reports changedFileCount equal to fileCount", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await rm(path.join(repositoryPath, "src", "broken"), { recursive: true, force: true });

    await runCli<IndexResponse>(repositoryPath, "index");
    const result = await runCli<IndexResponse>(repositoryPath, "index", "--full");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.changedFileCount, result.json.fileCount);
  });
});

test("index second run with no changes reports changedFileCount of zero", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await rm(path.join(repositoryPath, "src", "broken"), { recursive: true, force: true });

    const first = await runCli<IndexResponse>(repositoryPath, "index");
    const second = await runCli<IndexResponse>(repositoryPath, "index");

    assert.equal(second.exitCode, 0);
    assert.equal(second.json.status, "ok");
    assert.equal(second.json.changedFileCount, 0);
    assert.equal(second.json.fileCount, first.json.fileCount);
    assert.equal(second.json.symbolCount, first.json.symbolCount);
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

test("search returns mixed ranked results with explicit evidence", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<SearchResponse>(repositoryPath, "search", "buildCacheKey");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.resultCount, 2);
    assert.equal(result.json.results[0]?.type, "symbol");
    assert.deepEqual(result.json.results[0]?.symbol, {
      name: "buildCacheKey",
      kind: "variable",
      path: "src/services/UserService.ts",
      line: 1,
      column: 7,
      exported: false,
    });
    assert.deepEqual(result.json.results[0]?.evidence, [{ field: "symbol_name", match: "exact" }]);

    assert.equal(result.json.results[1]?.type, "path");
    assert.equal(result.json.results[1]?.path, "src/services/UserService.ts");
    assert.ok(
      result.json.results[1]?.evidence.some((evidence) => evidence.field === "symbol_name" && evidence.match === "exact"),
    );
    assert.equal("score" in result.json.results[0]!, false);
    assert.equal("score" in result.json.results[1]!, false);
  });
});

test("search anchors text-only matches to repository paths", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<SearchResponse>(repositoryPath, "search", "sessions");

    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.json, {
      query: "sessions",
      status: "ok",
      resultCount: 1,
      results: [
        {
          type: "path",
          path: "src/setup/bootstrap.ts",
          evidence: [{ field: "source_text", match: "token" }],
        },
      ],
    });
  });
});

test("search ranks structural symbol matches ahead of text-only path matches", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<SearchResponse>(repositoryPath, "search", "cache");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.results[0]?.type, "symbol");
    assert.equal(result.json.results[0]?.symbol.name, "buildCacheKey");

    const bootstrapResult = result.json.results.find(
      (candidate) => candidate.type === "path" && candidate.path === "src/setup/bootstrap.ts",
    );

    assert.ok(bootstrapResult);
    assert.deepEqual(bootstrapResult.evidence, [{ field: "source_text", match: "token" }]);
  });
});

test("search returns no_matches when the query is absent", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<SearchResponse>(repositoryPath, "search", "MissingSearchTerm");

    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.json, {
      query: "MissingSearchTerm",
      status: "no_matches",
      resultCount: 0,
      results: [],
    });
  });
});

test("search returns a structured error when the index is missing", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<SearchResponse>(repositoryPath, "search", "cache");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "missing_index");
  });
});

test("search returns a deterministic top ten results", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<SearchResponse>(repositoryPath, "search", "common");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.resultCount, 10);
    assert.equal(result.json.results.length, 10);
    assert.deepEqual(
      result.json.results.slice(0, 4).map((candidate) =>
        candidate.type === "symbol" ? `${candidate.type}:${candidate.symbol.name}` : `${candidate.type}:${candidate.path}`,
      ),
      [
        "symbol:commonThingA",
        "symbol:commonThingB",
        "symbol:commonThingC",
        "symbol:commonThingD",
      ],
    );
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

test("capsule returns the full pivot source, pivot symbols, and grouped outgoing neighbor summaries", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/calls/AliasCallers.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.path, "src/calls/AliasCallers.ts");
    assert.equal(
      result.json.pivot.source,
      [
        'import { sharedTarget as aliasedTarget } from "./SharedTarget";',
        'import { sharedTargetFromBarrel } from "./SharedTargetBarrel";',
        'import * as SharedTargets from "./SharedTarget";',
        'import { overloaded } from "./Overloads";',
        "",
        "export function callSharedTwice(): string {",
        "  aliasedTarget();",
        "  return aliasedTarget();",
        "}",
        "",
        "export function callThroughNamespace(): string {",
        "  return SharedTargets.sharedTarget();",
        "}",
        "",
        "export function callThroughBarrel(): string {",
        "  return sharedTargetFromBarrel();",
        "}",
        "",
        "export function callOverloaded(): string {",
        '  return overloaded("value");',
        "}",
        "",
      ].join("\n"),
    );
    assert.equal(result.json.symbolCount, 4);
    assert.deepEqual(result.json.symbols, [
      {
        name: "callSharedTwice",
        kind: "function",
        path: "src/calls/AliasCallers.ts",
        line: 6,
        column: 17,
        exported: true,
      },
      {
        name: "callThroughNamespace",
        kind: "function",
        path: "src/calls/AliasCallers.ts",
        line: 11,
        column: 17,
        exported: true,
      },
      {
        name: "callThroughBarrel",
        kind: "function",
        path: "src/calls/AliasCallers.ts",
        line: 15,
        column: 17,
        exported: true,
      },
      {
        name: "callOverloaded",
        kind: "function",
        path: "src/calls/AliasCallers.ts",
        line: 19,
        column: 17,
        exported: true,
      },
    ]);
    assert.equal(result.json.neighborCount, 3);
    assert.deepEqual(result.json.neighbors, [
      {
        path: "src/calls/Overloads.ts",
        skeleton:
          "export function overloaded(value: string): string;\n" +
          "export function overloaded(value: number): string;\n" +
          "export function overloaded(value: string | number): string {}\n",
        filtering: {
          redactionCount: 0, redactionCategories: [], truncated: false,
          originalByteCount: 164, outputByteCount: 164, omittedByteCount: 0,
        },
        imports: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 1 }],
        importedBy: [],
        callsTo: [
          {
            caller: {
              name: "callOverloaded",
              kind: "function",
              path: "src/calls/AliasCallers.ts",
              line: 19,
              column: 17,
              exported: true,
            },
            callee: {
              name: "overloaded",
              kind: "function",
              path: "src/calls/Overloads.ts",
              line: 3,
              column: 17,
              exported: true,
            },
            count: 1,
          },
        ],
        calledBy: [],
      },
      {
        path: "src/calls/SharedTarget.ts",
        skeleton:
          "export function sharedTarget(): string {}\n" +
          "\n" +
          "function internalShared(): string {}\n" +
          "\n" +
          "export function usesInternalShared(): string {}\n" +
          "\n" +
          "export function recursiveLoop(remaining: number): number {}\n" +
          "\n" +
          "export function isolatedSubject(): string {}\n",
        filtering: {
          redactionCount: 0, redactionCategories: [], truncated: false,
          originalByteCount: 236, outputByteCount: 236, omittedByteCount: 0,
        },
        imports: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 2 }],
        importedBy: [],
        callsTo: [
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
            count: 2,
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
            count: 1,
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
            count: 1,
          },
        ],
        calledBy: [],
      },
      {
        path: "src/calls/SharedTargetBarrel.ts",
        skeleton: 'export { sharedTarget as sharedTargetFromBarrel } from "./SharedTarget";\n',
        filtering: {
          redactionCount: 0, redactionCategories: [], truncated: false,
          originalByteCount: 73, outputByteCount: 73, omittedByteCount: 0,
        },
        imports: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 1 }],
        importedBy: [],
        callsTo: [],
        calledBy: [],
      },
    ]);
  });
});

test("capsule returns grouped incoming call and import evidence for one pivot file", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/calls/SharedTarget.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.symbolCount, 5);
    assert.equal(result.json.neighborCount, 4);
    assert.deepEqual(
      result.json.neighbors.map((neighbor) => ({
        path: neighbor.path,
        imports: neighbor.imports,
        importedBy: neighbor.importedBy,
        callsTo: neighbor.callsTo.map((call) => ({
          caller: call.caller.name,
          callee: call.callee.name,
          count: call.count,
        })),
        calledBy: neighbor.calledBy.map((call) => ({
          caller: call.caller.name,
          callee: call.callee.name,
          count: call.count,
        })),
      })),
      [
        {
          path: "src/calls/AliasCallers.ts",
          imports: [],
          importedBy: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 2 }],
          callsTo: [],
          calledBy: [
            { caller: "callSharedTwice", callee: "sharedTarget", count: 2 },
            { caller: "callThroughNamespace", callee: "sharedTarget", count: 1 },
            { caller: "callThroughBarrel", callee: "sharedTarget", count: 1 },
          ],
        },
        {
          path: "src/calls/NestedCalls.ts",
          imports: [],
          importedBy: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 1 }],
          callsTo: [],
          calledBy: [],
        },
        {
          path: "src/calls/SharedTargetBarrel.ts",
          imports: [],
          importedBy: [{ syntax: "re_export", typeOnly: false, sideEffect: false, count: 1 }],
          callsTo: [],
          calledBy: [],
        },
        {
          path: "src/calls/TsxCallers.tsx",
          imports: [],
          importedBy: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 1 }],
          callsTo: [],
          calledBy: [{ caller: "callFromTsx", callee: "sharedTarget", count: 1 }],
        },
      ],
    );
  });
});

test("capsule preserves type-only and side-effect import metadata in neighbor summaries", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/consumers/UseUserService.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.symbolCount, 1);
    assert.deepEqual(
      result.json.neighbors.map((neighbor) => ({
        path: neighbor.path,
        imports: neighbor.imports,
      })),
      [
        {
          path: "src/models/UserShape.ts",
          imports: [{ syntax: "import", typeOnly: true, sideEffect: false, count: 1 }],
        },
        {
          path: "src/services/UserService.ts",
          imports: [{ syntax: "import", typeOnly: false, sideEffect: false, count: 1 }],
        },
        {
          path: "src/setup/bootstrap.ts",
          imports: [{ syntax: "import", typeOnly: false, sideEffect: true, count: 1 }],
        },
      ],
    );
  });
});

test("capsule returns ok with zero neighbors for indexed files that have no direct neighbors", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/calls/collisions/DuplicateA.ts");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.symbolCount, 1);
    assert.deepEqual(result.json.symbols, [
      {
        name: "duplicateSubject",
        kind: "function",
        path: "src/calls/collisions/DuplicateA.ts",
        line: 1,
        column: 17,
        exported: true,
      },
    ]);
    assert.equal(result.json.neighborCount, 0);
    assert.deepEqual(result.json.neighbors, []);
    assert.equal(result.json.pivot.source, 'export function duplicateSubject(): string {\n  return "a";\n}\n');
  });
});

test("capsule returns a structured error when the index is missing", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/calls/AliasCallers.ts");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "missing_index");
  });
});

test("capsule returns a structured error when the target path is not indexed", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/types/global.d.ts");

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "path_not_indexed");
  });
});

test("capsule returns a structured containment error without source", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");
    const externalPath = path.join(path.dirname(repositoryPath), "outside.ts");
    await writeFile(externalPath, 'export const password = "must-not-appear";\n', "utf8");
    const pivotPath = path.join(repositoryPath, "src/calls/AliasCallers.ts");
    const { unlink, symlink } = await import("node:fs/promises");
    await unlink(pivotPath);
    await symlink(externalPath, pivotPath);

    const result = await runCli<CapsuleResponse>(repositoryPath, "capsule", "src/calls/AliasCallers.ts");
    assert.equal(result.exitCode, 1);
    assert.equal(result.json.error?.code, "path_outside_repository");
    assert.equal(result.json.pivot.source, "");
    assert.ok(!result.stdout.includes("must-not-appear"));
  });
});

// ---------------------------------------------------------------------------
// hooks install
// ---------------------------------------------------------------------------

test("hooks install --dry-run returns would_write for detected platforms without writing files", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".claude"), { recursive: true });

    const result = await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install", "--dry-run");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    // only claude detected; opencode/copilot/codex skipped
    assert.equal(result.json.platforms.length, 1);
    assert.equal(result.json.skipped.length, 3);

    const claudePlatform = result.json.platforms.find((p) => p.platform === "claude");
    assert.ok(claudePlatform);
    assert.equal(claudePlatform.hookType, "runtime");
    assert.equal(claudePlatform.action, "would_write");
    assert.equal(claudePlatform.hookScript, ".petrichor/hooks/claude.sh");

    // dry-run must not write the hook script
    const hookScriptPath = path.join(repositoryPath, ".petrichor", "hooks", "claude.sh");
    await assert.rejects(() => access(hookScriptPath));
  });
});

test("hooks install writes hook script and merges platform config for detected runtime platform", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".claude"), { recursive: true });

    const result = await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.platforms.length, 1);

    const claudePlatform = result.json.platforms.find((p) => p.platform === "claude");
    assert.ok(claudePlatform);
    assert.equal(claudePlatform.action, "written");

    // hook script must exist and be non-empty
    const hookScript = await readFile(
      path.join(repositoryPath, ".petrichor", "hooks", "claude.sh"),
      "utf8",
    );
    assert.ok(hookScript.includes("petrichor capsule"));
    assert.ok(hookScript.includes("missing_index|path_not_indexed"));
    assert.ok(hookScript.includes('echo "$CAPSULE"'));
    assert.ok(hookScript.startsWith("#!/usr/bin/env bash"));

    // settings.json must contain the hook entry
    const settings = JSON.parse(
      await readFile(path.join(repositoryPath, ".claude", "settings.json"), "utf8"),
    );
    assert.ok(
      settings.hooks?.PreToolUse?.some((e: { hooks: Array<{ command: string }> }) =>
        e.hooks?.some((h) => h.command?.includes("petrichor")),
      ),
    );
  });
});

test("hooks install is idempotent — re-running does not duplicate hook entries", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".claude"), { recursive: true });

    await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");
    await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");

    const settings = JSON.parse(
      await readFile(path.join(repositoryPath, ".claude", "settings.json"), "utf8"),
    );
    const petrichorEntries = settings.hooks?.PreToolUse?.filter((e: { hooks: Array<{ command: string }> }) =>
      e.hooks?.some((h) => h.command?.includes("petrichor")),
    );
    assert.equal(petrichorEntries?.length, 1);
  });
});

test("hooks install skips all platforms when no detection dirs are present", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.platforms.length, 0);
    assert.equal(result.json.skipped.length, 4);
    assert.ok(result.json.skipped.every((s) => s.reason === "not_detected"));
  });
});

test("hooks install writes instruction file for copilot when .github/ is present", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".github"), { recursive: true });

    const result = await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");

    assert.equal(result.exitCode, 0);

    const copilotPlatform = result.json.platforms.find((p) => p.platform === "copilot");
    assert.ok(copilotPlatform);
    assert.equal(copilotPlatform.hookType, "instruction");
    assert.equal(copilotPlatform.hookScript, null);
    assert.equal(copilotPlatform.action, "written");

    const instructions = await readFile(
      path.join(repositoryPath, ".github", "copilot-instructions.md"),
      "utf8",
    );
    assert.ok(instructions.includes("petrichor capsule"));
    assert.ok(instructions.includes("<!-- petrichor-start -->"));
  });
});

// ---------------------------------------------------------------------------
// hooks uninstall
// ---------------------------------------------------------------------------

test("hooks uninstall removes instruction block from copilot config", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".github"), { recursive: true });

    await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");
    const result = await runCli<HooksUninstallResponse>(repositoryPath, "hooks", "uninstall");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");

    const copilotResult = result.json.platforms.find((p) => p.platform === "copilot");
    assert.ok(copilotResult);
    assert.equal(copilotResult.action, "removed");

    const instructions = await readFile(
      path.join(repositoryPath, ".github", "copilot-instructions.md"),
      "utf8",
    );
    assert.ok(!instructions.includes("<!-- petrichor-start -->"));
  });
});

test("hooks uninstall --dry-run returns would_remove without modifying files", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".github"), { recursive: true });

    await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");
    const result = await runCli<HooksUninstallResponse>(repositoryPath, "hooks", "uninstall", "--dry-run");

    assert.equal(result.exitCode, 0);
    const copilotResult = result.json.platforms.find((p) => p.platform === "copilot");
    assert.ok(copilotResult);
    assert.equal(copilotResult.action, "would_remove");

    // file must still contain the block
    const instructions = await readFile(
      path.join(repositoryPath, ".github", "copilot-instructions.md"),
      "utf8",
    );
    assert.ok(instructions.includes("<!-- petrichor-start -->"));
  });
});

test("hooks uninstall returns not_installed when petrichor block is absent", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".github"), { recursive: true });

    const result = await runCli<HooksUninstallResponse>(repositoryPath, "hooks", "uninstall");

    assert.equal(result.exitCode, 0);
    const copilotResult = result.json.platforms.find((p) => p.platform === "copilot");
    assert.ok(copilotResult);
    assert.equal(copilotResult.action, "not_installed");
  });
});

test("hooks uninstall removes runtime hook script and cleans platform config", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await mkdir(path.join(repositoryPath, ".claude"), { recursive: true });

    await runCli<HooksInstallResponse>(repositoryPath, "hooks", "install");
    const result = await runCli<HooksUninstallResponse>(repositoryPath, "hooks", "uninstall");

    assert.equal(result.exitCode, 0);
    const claudeResult = result.json.platforms.find((p) => p.platform === "claude");
    assert.ok(claudeResult);
    assert.equal(claudeResult.action, "removed");

    // hook script must be gone
    await assert.rejects(() => access(path.join(repositoryPath, ".petrichor", "hooks", "claude.sh")));

    // settings.json must have no petrichor entry
    const settings = JSON.parse(
      await readFile(path.join(repositoryPath, ".claude", "settings.json"), "utf8"),
    );
    const petrichorEntries = settings.hooks?.PreToolUse?.filter((e: { hooks: Array<{ command: string }> }) =>
      e.hooks?.some((h) => h.command?.includes("petrichor")),
    );
    assert.equal(petrichorEntries?.length ?? 0, 0);
  });
});

test("session record reads one event from stdin and session guide returns its current state", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const recorded = await runCliWithInput<SessionRecordResponse>(
      repositoryPath,
      JSON.stringify({ type: "task", key: "slice-9", summary: "Implement Slice 9", status: "pending" }),
      "session", "record", "--session", "agent-42",
    );

    assert.equal(recorded.exitCode, 0);
    assert.deepEqual(recorded.json, { status: "ok", sessionId: "agent-42", eventId: 1 });
    await access(path.join(repositoryPath, ".petrichor", "session.db"));

    const rebuilt = await runCli<IndexResponse>(repositoryPath, "index", "--full");
    assert.equal(rebuilt.exitCode, 0);

    const guide = await runCli<SessionGuideResponse>(
      repositoryPath, "session", "guide", "--session", "agent-42",
    );
    assert.equal(guide.exitCode, 0);
    assert.equal(guide.json.status, "ok");
    assert.deepEqual(guide.json.guide.pendingTasks, [
      { key: "slice-9", summary: "Implement Slice 9" },
    ]);
  });
});

test("session guide returns no_matches for an unknown Coding Session", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCli<SessionGuideResponse>(
      repositoryPath, "session", "guide", "--session", "unknown",
    );

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "no_matches");
    assert.equal(result.json.guide.latestIntent, null);
  });
});

test("session record rejects malformed events with valid JSON output", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const result = await runCliWithInput<SessionRecordResponse>(
      repositoryPath, "not json", "session", "record", "--session", "agent-42",
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "invalid_session_event");
  });
});
