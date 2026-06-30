import { access, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { GlobalLookupMatch, RegisteredRepository, SkippedRepository } from "../contracts";
import { lookupSymbols } from "./database";
import { PetrichorError } from "./errors";
import { getGlobalRegistryPath, getIndexPath } from "./project";

interface RepositoryRow {
  repository_root: string;
}

export async function registerRepository(repositoryRoot: string): Promise<string> {
  const canonicalRoot = await realpath(repositoryRoot);
  const registryPath = getGlobalRegistryPath();
  await mkdir(path.dirname(registryPath), { recursive: true });

  const database = openRegistry(registryPath);
  try {
    database.prepare(`
      INSERT INTO repositories (repository_root)
      VALUES (?)
      ON CONFLICT (repository_root) DO NOTHING
    `).run(canonicalRoot);
  } finally {
    database.close();
  }

  return canonicalRoot;
}

export async function listRegisteredRepositories(): Promise<RegisteredRepository[]> {
  const registryPath = getGlobalRegistryPath();
  await mkdir(path.dirname(registryPath), { recursive: true });

  const database = openRegistry(registryPath);
  let roots: string[];
  try {
    roots = (database.prepare(`
      SELECT repository_root
      FROM repositories
      ORDER BY repository_root ASC
    `).all() as RepositoryRow[]).map((row) => row.repository_root);
  } finally {
    database.close();
  }

  return Promise.all(roots.map(describeRepository));
}

export async function removeRegisteredRepository(repositoryRoot: string): Promise<"removed" | "not_registered"> {
  const registryPath = getGlobalRegistryPath();
  await mkdir(path.dirname(registryPath), { recursive: true });

  const database = openRegistry(registryPath);
  try {
    const result = database.prepare(`
      DELETE FROM repositories
      WHERE repository_root = ?
    `).run(repositoryRoot);
    return result.changes === 0 ? "not_registered" : "removed";
  } finally {
    database.close();
  }
}

export interface GlobalLookupResult {
  matches: GlobalLookupMatch[];
  skippedRepositories: SkippedRepository[];
  availableRepositoryCount: number;
}

export async function lookupAcrossRepositories(query: string): Promise<GlobalLookupResult> {
  const repositories = await listRegisteredRepositories();
  const matches: GlobalLookupMatch[] = [];
  const skippedRepositories: SkippedRepository[] = [];
  let availableRepositoryCount = 0;

  for (const repository of repositories) {
    if (repository.availability === "unavailable") {
      skippedRepositories.push({
        repositoryRoot: repository.repositoryRoot,
        reason: repository.reason,
      });
      continue;
    }

    availableRepositoryCount += 1;
    matches.push(...lookupSymbols(getIndexPath(repository.repositoryRoot), query).map((symbol) => ({
      ...symbol,
      repositoryRoot: repository.repositoryRoot,
    })));
  }

  matches.sort((left, right) =>
    Number(right.exported) - Number(left.exported)
    || compareText(left.repositoryRoot, right.repositoryRoot)
    || compareText(left.path, right.path)
    || left.line - right.line
    || left.column - right.column);

  return { matches, skippedRepositories, availableRepositoryCount };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function resolveRegisteredRepository(repositoryRoot: string): Promise<string> {
  const repositories = await listRegisteredRepositories();
  const repository = repositories.find((candidate) => candidate.repositoryRoot === repositoryRoot);
  if (!repository) {
    throw new PetrichorError(
      "repository_not_registered",
      `Repository is not registered: ${repositoryRoot}`,
    );
  }

  if (repository.availability === "unavailable") {
    throw new PetrichorError(
      repository.reason,
      `Registered Repository is unavailable: ${repositoryRoot}`,
    );
  }

  return repository.repositoryRoot;
}

async function describeRepository(repositoryRoot: string): Promise<RegisteredRepository> {
  if (!(await exists(repositoryRoot))) {
    return { repositoryRoot, availability: "unavailable", reason: "repository_missing" };
  }

  if (!(await exists(getIndexPath(repositoryRoot)))) {
    return { repositoryRoot, availability: "unavailable", reason: "index_missing" };
  }

  return { repositoryRoot, availability: "available" };
}

function openRegistry(registryPath: string): Database.Database {
  const database = new Database(registryPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      repository_root TEXT NOT NULL PRIMARY KEY
    )
  `);
  return database;
}

async function exists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}
