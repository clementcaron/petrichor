import { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ignore, { Ignore } from "ignore";

import { toRepoRelativePath } from "./project";

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".petrichor",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const TEST_DIRECTORY_NAMES = new Set(["__tests__", "spec", "specs", "test", "tests"]);
const TEST_FILE_PATTERN = /(?:^|[.-])(spec|test)\.tsx?$/;

export async function collectSourceFiles(repositoryRoot: string): Promise<string[]> {
  const gitIgnoreMatcher = await loadGitIgnore(repositoryRoot);
  const files: string[] = [];

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left: Dirent, right: Dirent) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = toRepoRelativePath(repositoryRoot, absolutePath);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name) || isTestDirectory(relativePath) || isIgnored(gitIgnoreMatcher, relativePath, true)) {
          continue;
        }

        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!isCandidateSourceFile(relativePath) || isIgnored(gitIgnoreMatcher, relativePath, false)) {
        continue;
      }

      files.push(absolutePath);
    }
  }

  await walk(repositoryRoot);

  return files.sort((left, right) =>
    toRepoRelativePath(repositoryRoot, left).localeCompare(toRepoRelativePath(repositoryRoot, right)),
  );
}

async function loadGitIgnore(repositoryRoot: string): Promise<Ignore> {
  const matcher = ignore();
  const gitIgnorePath = path.join(repositoryRoot, ".gitignore");

  try {
    const contents = await readFile(gitIgnorePath, "utf8");
    matcher.add(contents);
  } catch {
    return matcher;
  }

  return matcher;
}

function isCandidateSourceFile(relativePath: string): boolean {
  if (!(relativePath.endsWith(".ts") || relativePath.endsWith(".tsx"))) {
    return false;
  }

  if (relativePath.endsWith(".d.ts")) {
    return false;
  }

  if (TEST_FILE_PATTERN.test(path.posix.basename(relativePath))) {
    return false;
  }

  return !isTestDirectory(relativePath);
}

function isTestDirectory(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.some((segment) => TEST_DIRECTORY_NAMES.has(segment));
}

function isIgnored(matcher: Ignore, relativePath: string, directory: boolean): boolean {
  return matcher.ignores(directory ? `${relativePath}/` : relativePath);
}
