import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { CapsuleResponse, IndexResponse } from "../src/contracts";
import { queryCapsule } from "../src/lib/capsule";
import { getIndexPath } from "../src/lib/project";
import { runCli, withFixtureRepository } from "./helpers";

async function withIndexedRepository<T>(
  callback: (repositoryRoot: string, indexPath: string) => Promise<T>,
): Promise<T> {
  return withFixtureRepository("repository", async (repositoryRoot) => {
    await runCli<IndexResponse>(repositoryRoot, "index");
    return callback(repositoryRoot, getIndexPath(repositoryRoot));
  });
}

test("queryCapsule returns full response shape for an indexed Repository Path", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    assert.equal(result.status, "ok");
    assert.equal(result.path, "src/calls/AliasCallers.ts");
    assert.ok(result.pivot.source.includes("callSharedTwice"));
    assert.equal(result.symbolCount, 4);
    assert.equal(result.symbols.length, 4);
    assert.ok(result.symbols.every((symbol) => symbol.path === "src/calls/AliasCallers.ts"));
  });
});

test("queryCapsule throws path_not_indexed for an unindexed Repository Path", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    await assert.rejects(
      () => queryCapsule(indexPath, repositoryRoot, "src/types/global.d.ts"),
      (error: Error) => {
        assert.ok(error.message.includes("path_not_indexed") || ("code" in error && error.code === "path_not_indexed"));
        return true;
      },
    );
  });
});

test("queryCapsule returns zero neighbors for a file with no direct import or call edges", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/collisions/DuplicateA.ts");

    assert.equal(result.status, "ok");
    assert.equal(result.neighborCount, 0);
    assert.deepEqual(result.neighbors, []);
  });
});

test("queryCapsule groups multiple import edges of the same kind into a single summary with count", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    // AliasCallers imports SharedTarget twice (two import statements with same syntax/flags)
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    const sharedTargetNeighbor = result.neighbors.find((n) => n.path === "src/calls/SharedTarget.ts");
    assert.ok(sharedTargetNeighbor, "SharedTarget.ts should appear as a neighbor");

    const groupedImport = sharedTargetNeighbor!.imports.find((i) => i.count === 2);
    assert.ok(groupedImport, "Multiple imports of the same syntax/flags should be grouped with count=2");
    assert.equal(groupedImport!.syntax, "import");
    assert.equal(groupedImport!.typeOnly, false);
    assert.equal(groupedImport!.sideEffect, false);
  });
});

test("queryCapsule groups repeated call edges from the same caller/callee pair into a single summary with count", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    // callSharedTwice calls sharedTarget twice from the same caller declaration
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    const sharedTargetNeighbor = result.neighbors.find((n) => n.path === "src/calls/SharedTarget.ts");
    assert.ok(sharedTargetNeighbor, "SharedTarget.ts should appear as a neighbor");

    const repeatedCall = sharedTargetNeighbor!.callsTo.find(
      (c) => c.caller.name === "callSharedTwice" && c.callee.name === "sharedTarget",
    );
    assert.ok(repeatedCall, "Repeated calls from same caller/callee should be grouped");
    assert.equal(repeatedCall!.count, 2);
  });
});

test("queryCapsule orders neighbors lexicographically by Repository Path", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    assert.ok(result.neighbors.length > 1, "Expected multiple neighbors for ordering test");
    const paths = result.neighbors.map((n) => n.path);
    const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(paths, sortedPaths, "Neighbors must be in lexicographic Repository Path order");
  });
});

test("queryCapsule preserves type-only and side-effect metadata in neighbor import summaries", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    // UseUserService.ts has a type-only import (UserShape) and a side-effect import (bootstrap)
    const result = await queryCapsule(indexPath, repositoryRoot, "src/consumers/UseUserService.ts");

    const userShapeNeighbor = result.neighbors.find((n) => n.path === "src/models/UserShape.ts");
    assert.ok(userShapeNeighbor, "UserShape.ts should appear as neighbor");
    assert.ok(
      userShapeNeighbor!.imports.some((i) => i.typeOnly === true),
      "type-only import should be preserved in neighbor summary",
    );

    const bootstrapNeighbor = result.neighbors.find((n) => n.path === "src/setup/bootstrap.ts");
    assert.ok(bootstrapNeighbor, "bootstrap.ts should appear as neighbor");
    assert.ok(
      bootstrapNeighbor!.imports.some((i) => i.sideEffect === true),
      "side-effect import should be preserved in neighbor summary",
    );
  });
});

test("queryCapsule response satisfies the CapsuleResponse contract shape", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    // Verify the full contract shape is satisfied
    const asResponse: CapsuleResponse = result;
    assert.ok(typeof asResponse.path === "string");
    assert.ok(typeof asResponse.status === "string");
    assert.ok(typeof asResponse.pivot.source === "string");
    assert.ok(typeof asResponse.symbolCount === "number");
    assert.ok(Array.isArray(asResponse.symbols));
    assert.ok(typeof asResponse.neighborCount === "number");
    assert.ok(Array.isArray(asResponse.neighbors));
    assert.equal(asResponse.symbolCount, asResponse.symbols.length);
    assert.equal(asResponse.neighborCount, asResponse.neighbors.length);
  });
});

test("queryCapsule includes incoming call relationships from other files as calledBy neighbors", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    // SharedTarget.ts is called by AliasCallers.ts and TsxCallers.tsx
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/SharedTarget.ts");

    const calledByPaths = result.neighbors.filter((n) => n.calledBy.length > 0).map((n) => n.path);
    assert.ok(calledByPaths.length > 0, "SharedTarget should have calledBy neighbors");
  });
});

test("queryCapsule pivot source matches the actual file content on disk", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const { readFile } = await import("node:fs/promises");
    const actualSource = await readFile(path.join(repositoryRoot, "src/calls/AliasCallers.ts"), "utf8");
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    assert.equal(result.pivot.source, actualSource);
  });
});

test("queryCapsule neighbor skeleton strips function bodies but preserves signatures", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    const sharedTargetNeighbor = result.neighbors.find((n) => n.path === "src/calls/SharedTarget.ts");
    assert.ok(sharedTargetNeighbor, "SharedTarget.ts should appear as a neighbor");

    const skeleton = sharedTargetNeighbor!.skeleton;
    assert.ok(typeof skeleton === "string", "skeleton must be a string");
    assert.ok(skeleton.includes("sharedTarget(): string"), "skeleton preserves function signature");
    assert.ok(!skeleton.includes('return "shared"'), "skeleton strips function body content");
    assert.ok(skeleton.includes("{}"), "skeleton uses empty block placeholder");
  });
});

test("queryCapsule neighbor skeleton for a file with no function bodies equals its source", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    // SharedTargetBarrel.ts contains only a re-export — no function bodies to strip
    const { readFile } = await import("node:fs/promises");
    const actualSource = await readFile(path.join(repositoryRoot, "src/calls/SharedTargetBarrel.ts"), "utf8");

    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");
    const barrelNeighbor = result.neighbors.find((n) => n.path === "src/calls/SharedTargetBarrel.ts");
    assert.ok(barrelNeighbor, "SharedTargetBarrel.ts should appear as a neighbor");
    assert.equal(barrelNeighbor!.skeleton, actualSource);
  });
});

test("queryCapsule neighbor skeleton includes overload signatures without bodies unchanged", async () => {
  await withIndexedRepository(async (repositoryRoot, indexPath) => {
    const result = await queryCapsule(indexPath, repositoryRoot, "src/calls/AliasCallers.ts");

    const overloadsNeighbor = result.neighbors.find((n) => n.path === "src/calls/Overloads.ts");
    assert.ok(overloadsNeighbor, "Overloads.ts should appear as a neighbor");

    const skeleton = overloadsNeighbor!.skeleton;
    // Both overload signatures (no body) are preserved as-is
    assert.ok(skeleton.includes("overloaded(value: string): string;"), "overload signature preserved");
    assert.ok(skeleton.includes("overloaded(value: number): string;"), "second overload signature preserved");
    // Implementation body is stripped
    assert.ok(!skeleton.includes("return String(value)"), "implementation body stripped");
  });
});
