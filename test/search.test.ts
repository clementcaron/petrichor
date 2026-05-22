import assert from "node:assert/strict";
import test from "node:test";

import { IndexResponse, SearchResult } from "../src/contracts";
import { getIndexPath } from "../src/lib/project";
import { runSearchQuery } from "../src/lib/search";
import { runCli, withFixtureRepository } from "./helpers";

async function withIndexedRepository<T>(
  callback: (indexPath: string) => Promise<T>,
): Promise<T> {
  return withFixtureRepository("repository", async (repositoryRoot) => {
    await runCli<IndexResponse>(repositoryRoot, "index");
    return callback(getIndexPath(repositoryRoot));
  });
}

test("runSearchQuery returns empty array for an empty or whitespace-only query", async () => {
  await withIndexedRepository(async (indexPath) => {
    assert.deepEqual(runSearchQuery(indexPath, ""), []);
    assert.deepEqual(runSearchQuery(indexPath, "   "), []);
  });
});

test("runSearchQuery returns empty array when no candidates match the query", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "AbsolutelyMissingSymbolXYZ");
    assert.deepEqual(results, []);
  });
});

test("runSearchQuery returns a symbol result with exact symbol_name evidence for a known symbol", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "buildCacheKey");

    assert.ok(results.length > 0, "Expected at least one result");
    const symbolResult = results.find((r): r is Extract<SearchResult, { type: "symbol" }> => r.type === "symbol");
    assert.ok(symbolResult, "Expected a symbol result");
    assert.equal(symbolResult.symbol.name, "buildCacheKey");
    assert.deepEqual(symbolResult.evidence, [{ field: "symbol_name", match: "exact" }]);
  });
});

test("runSearchQuery anchors text-only matches to a Repository Path result", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "sessions");

    assert.equal(results.length, 1);
    const result = results[0]!;
    assert.equal(result.type, "path");
    assert.equal(result.path, "src/setup/bootstrap.ts");
    assert.deepEqual(result.evidence, [{ field: "source_text", match: "token" }]);
  });
});

test("runSearchQuery ranks symbol results ahead of path-only results", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "cache");

    assert.ok(results.length > 0, "Expected results");
    assert.equal(results[0]!.type, "symbol", "First result should be a symbol");
  });
});

test("runSearchQuery attaches explicit Search Evidence to every result", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "buildCacheKey");

    assert.ok(results.length > 0, "Expected results");
    for (const result of results) {
      assert.ok(result.evidence.length > 0, `Result ${JSON.stringify(result)} must have evidence`);
      for (const e of result.evidence) {
        assert.ok(typeof e.field === "string", "evidence.field must be a string");
        assert.ok(typeof e.match === "string", "evidence.match must be a string");
      }
    }
  });
});

test("runSearchQuery respects the top-N limit and returns exactly that many results when available", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "common", 10);

    assert.equal(results.length, 10);
  });
});

test("runSearchQuery returns a smaller set when fewer results exist than the limit", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "sessions", 10);

    assert.ok(results.length < 10, "Should return fewer results than the limit when fewer exist");
  });
});

test("runSearchQuery produces deterministic ordering across repeated calls", async () => {
  await withIndexedRepository(async (indexPath) => {
    const first = runSearchQuery(indexPath, "common", 10);
    const second = runSearchQuery(indexPath, "common", 10);

    assert.deepEqual(first, second, "Repeated calls with the same query must return the same ordered results");
  });
});

test("runSearchQuery ranks symbol-name matches above repository-path matches", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "UserService");

    const symbolResults = results.filter((r) => r.type === "symbol");
    const pathResults = results.filter((r) => r.type === "path");

    if (symbolResults.length > 0 && pathResults.length > 0) {
      const firstSymbolIndex = results.indexOf(symbolResults[0]!);
      const firstPathIndex = results.indexOf(pathResults[0]!);
      assert.ok(firstSymbolIndex < firstPathIndex, "Symbol results should rank before path-only results");
    }
  });
});

test("runSearchQuery results never expose raw numeric scores on the public shape", async () => {
  await withIndexedRepository(async (indexPath) => {
    const results = runSearchQuery(indexPath, "buildCacheKey");

    for (const result of results) {
      assert.equal("score" in result, false, "score must not appear on public SearchResult");
    }
  });
});
