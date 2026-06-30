import assert from "node:assert/strict";
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { IndexResponse } from "../src/contracts";
import { runCli, runCliWithHome, withFixtureRepositories, withFixtureRepository } from "./helpers";

test("index registers the current Repository in the Global Registry", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await rm(`${repositoryPath}/src/broken`, { recursive: true, force: true });

    const indexResult = await runCli<IndexResponse>(repositoryPath, "index");
    const listResult = await runCli<{
      status: string;
      repositoryCount: number;
      repositories: Array<{ repositoryRoot: string; availability: string }>;
    }>(repositoryPath, "registry", "list");

    assert.equal(indexResult.exitCode, 0);
    assert.equal(listResult.exitCode, 0);
    assert.deepEqual(listResult.json, {
      status: "ok",
      repositoryCount: 1,
      repositories: [{ repositoryRoot: await realpath(repositoryPath), availability: "available" }],
    });
  });
});

test("index uses one canonical identity for real and symlinked Repository roots", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const symlinkPath = path.join(path.dirname(repositoryPath), "repository-link");
    await symlink(repositoryPath, symlinkPath, "dir");

    await runCli<IndexResponse>(repositoryPath, "index");
    await runCli<IndexResponse>(symlinkPath, "index");
    const result = await runCli<{ repositoryCount: number; repositories: Array<{ repositoryRoot: string }> }>(
      repositoryPath,
      "registry",
      "list",
    );

    assert.equal(result.json.repositoryCount, 1);
    assert.equal(result.json.repositories[0]?.repositoryRoot, await realpath(repositoryPath));
  });
});

test("registry remove is idempotent", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");
    const repositoryRoot = await realpath(repositoryPath);

    const first = await runCli<{ status: string; repositoryRoot: string; action: string }>(
      repositoryPath,
      "registry",
      "remove",
      repositoryRoot,
    );
    const second = await runCli<{ status: string; repositoryRoot: string; action: string }>(
      repositoryPath,
      "registry",
      "remove",
      repositoryRoot,
    );
    const list = await runCli<{ repositoryCount: number }>(repositoryPath, "registry", "list");

    assert.deepEqual(first.json, { status: "ok", repositoryRoot, action: "removed" });
    assert.deepEqual(second.json, { status: "ok", repositoryRoot, action: "not_registered" });
    assert.equal(list.json.repositoryCount, 0);
  });
});

test("registry list retains and reports unavailable Repositories", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");
    await rm(`${repositoryPath}/.petrichor/index.db`);

    const result = await runCli<{
      repositories: Array<{ repositoryRoot: string; availability: string; reason?: string }>;
    }>(repositoryPath, "registry", "list");

    assert.deepEqual(result.json.repositories, [{
      repositoryRoot: await realpath(repositoryPath),
      availability: "unavailable",
      reason: "index_missing",
    }]);
  });
});

test("lookup --all combines exact matches from Registered Repositories in deterministic order", async () => {
  await withFixtureRepositories("repository", 2, async ([firstRepository, secondRepository]) => {
    await Promise.all([
      rm(`${firstRepository}/src/broken`, { recursive: true, force: true }),
      rm(`${secondRepository}/src/broken`, { recursive: true, force: true }),
    ]);
    await runCli<IndexResponse>(firstRepository, "index");
    await runCli<IndexResponse>(secondRepository, "index");

    const result = await runCli<{
      status: string;
      matchCount: number;
      matches: Array<{ repositoryRoot: string }>;
      skippedRepositories: unknown[];
    }>(firstRepository, "lookup", "UserService", "--all");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.matchCount, 4);
    assert.deepEqual(result.json.matches.map((match) => match.repositoryRoot), [
      await realpath(firstRepository),
      await realpath(firstRepository),
      await realpath(secondRepository),
      await realpath(secondRepository),
    ]);
    assert.deepEqual(result.json.skippedRepositories, []);
  });
});

test("lookup --all returns partial results and reports unavailable Repositories", async () => {
  await withFixtureRepositories("repository", 2, async ([availableRepository, unavailableRepository]) => {
    await runCli<IndexResponse>(availableRepository, "index");
    await runCli<IndexResponse>(unavailableRepository, "index");
    await rm(`${unavailableRepository}/.petrichor/index.db`);

    const result = await runCli<{
      status: string;
      matchCount: number;
      skippedRepositories: Array<{ repositoryRoot: string; reason: string }>;
    }>(availableRepository, "lookup", "UserService", "--all");

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "partial");
    assert.equal(result.json.matchCount, 2);
    assert.deepEqual(result.json.skippedRepositories, [{
      repositoryRoot: await realpath(unavailableRepository),
      reason: "index_missing",
    }]);
  });
});

test("lookup --all fails when no Registered Repository is available", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");
    await rm(`${repositoryPath}/.petrichor/index.db`);

    const result = await runCli<{ status: string; error?: { code: string } }>(
      repositoryPath,
      "lookup",
      "UserService",
      "--all",
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.error?.code, "no_available_repositories");
  });
});

test("capsule --repository returns a Context Capsule outside the Registered Repository", async () => {
  await withFixtureRepositories("repository", 2, async ([targetRepository]) => {
    await rm(`${targetRepository}/src/broken`, { recursive: true, force: true });
    await runCli<IndexResponse>(targetRepository, "index");
    const repositoryRoot = await realpath(targetRepository);
    const temporaryRoot = path.dirname(targetRepository);
    const outsideDirectory = path.join(temporaryRoot, "outside");
    await mkdir(outsideDirectory);

    const result = await runCliWithHome<{
      status: string;
      repositoryRoot: string;
      path: string;
      pivot: { source: string };
    }>(
      outsideDirectory,
      path.join(temporaryRoot, ".home"),
      "capsule",
      "src/api/UserService.ts",
      "--repository",
      repositoryRoot,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(result.json.status, "ok");
    assert.equal(result.json.repositoryRoot, repositoryRoot);
    assert.equal(result.json.path, "src/api/UserService.ts");
    assert.match(result.json.pivot.source, /export class UserService/);
  });
});

test("capsule --repository fails when the Registered Repository Index is unavailable", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    await runCli<IndexResponse>(repositoryPath, "index");
    const repositoryRoot = await realpath(repositoryPath);
    await rm(`${repositoryPath}/.petrichor/index.db`);

    const result = await runCli<{ status: string; repositoryRoot: string; error?: { code: string } }>(
      repositoryPath,
      "capsule",
      "src/api/UserService.ts",
      "--repository",
      repositoryRoot,
    );

    assert.equal(result.exitCode, 1);
    assert.equal(result.json.status, "error");
    assert.equal(result.json.repositoryRoot, repositoryRoot);
    assert.equal(result.json.error?.code, "index_missing");
  });
});

test("index reports registry failure without discarding the usable Repository Index", async () => {
  await withFixtureRepository("repository", async (repositoryPath) => {
    const invalidHome = path.join(path.dirname(repositoryPath), "not-a-directory");
    await writeFile(invalidHome, "file");

    const indexResult = await runCliWithHome<IndexResponse>(repositoryPath, invalidHome, "index");
    const lookupResult = await runCli<{ status: string; matchCount: number }>(
      repositoryPath,
      "lookup",
      "UserService",
    );

    assert.equal(indexResult.exitCode, 1);
    assert.equal(indexResult.json.error?.code, "registry_update_failed");
    assert.equal(lookupResult.exitCode, 0);
    assert.equal(lookupResult.json.status, "ok");
    assert.equal(lookupResult.json.matchCount, 2);
  });
});
