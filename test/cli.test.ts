import { access, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { IndexResponse, LookupResponse } from "../src/contracts";
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
