import { access, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { ImportRelationshipsResponse, IndexResponse, LookupResponse } from "../src/contracts";
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
