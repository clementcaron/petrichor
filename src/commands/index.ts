import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import { CallRelationship, ImportRelationship, IndexedFunction, IndexResponse, IndexedSymbol } from "../contracts";
import { loadCompilerOptions } from "../lib/compiler";
import { applyIncrementalUpdate, readIndexCounts, readStoredFileHashes, writeIndexDatabase } from "../lib/database";
import { PetrichorError, toCliError } from "../lib/errors";
import { collectSourceFiles } from "../lib/files";
import { computeContentHash } from "../lib/hashing";
import { writeJson } from "../lib/output";
import { getIndexPath, INDEX_RELATIVE_PATH, toRepoRelativePath } from "../lib/project";
import { registerRepository } from "../lib/registry";
import { extractIndexDataFromProgram } from "../lib/symbols";

export async function runIndexCommand(fullRebuild = false): Promise<number> {
  const repositoryRoot = process.cwd();
  const baseResponse: IndexResponse = {
    status: "error",
    indexPath: INDEX_RELATIVE_PATH,
    fileCount: 0,
    symbolCount: 0,
    changedFileCount: 0,
    skippedFileCount: 0,
    skippedFiles: [],
  };

  try {
    const sourceFiles = await collectSourceFiles(repositoryRoot);
    const compilerOptions = loadCompilerOptions(repositoryRoot);

    const storedHashes = fullRebuild ? null : readStoredFileHashes(getIndexPath(repositoryRoot));

    const currentHashes = await computeFileHashes(sourceFiles, repositoryRoot);

    const { changedPaths, removedPaths } = diffHashes(storedHashes, currentHashes);
    const isIncremental = storedHashes !== null;

    const program = ts.createProgram({
      options: compilerOptions,
      rootNames: sourceFiles,
    });

    const extraction = extractIndexDataFromProgram(
      program,
      repositoryRoot,
      isIncremental ? changedPaths : undefined,
    );

    if (isIncremental) {
      await writeIncrementallyAtomically(
        repositoryRoot,
        new Set([...changedPaths, ...removedPaths]),
        extraction.indexedFiles,
        currentHashes,
        extraction.indexedFileSearchDocuments,
        extraction.symbols,
        extraction.importRelationships,
        extraction.callableFunctions,
        extraction.callRelationships,
      );
    } else {
      await writeFullAtomically(
        repositoryRoot,
        extraction.indexedFiles,
        currentHashes,
        extraction.indexedFileSearchDocuments,
        extraction.symbols,
        extraction.importRelationships,
        extraction.callableFunctions,
        extraction.callRelationships,
      );
    }

    const counts = readIndexCounts(getIndexPath(repositoryRoot));
    try {
      await registerRepository(repositoryRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      throw new PetrichorError("registry_update_failed", `Repository indexed, but registration failed: ${message}`);
    }

    writeJson({
      status: extraction.skippedFiles.length > 0 ? "partial" : "ok",
      indexPath: INDEX_RELATIVE_PATH,
      fileCount: counts.fileCount,
      symbolCount: counts.symbolCount,
      changedFileCount: changedPaths.size,
      skippedFileCount: extraction.skippedFiles.length,
      skippedFiles: extraction.skippedFiles,
    } satisfies IndexResponse);

    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "index_failed"),
    });

    return 1;
  }
}

async function computeFileHashes(absolutePaths: string[], repositoryRoot: string): Promise<Map<string, string>> {
  const entries = await Promise.all(
    absolutePaths.map(async (absolutePath) => {
      const relativePath = toRepoRelativePath(repositoryRoot, absolutePath);
      const hash = await computeContentHash(absolutePath);
      return [relativePath, hash] as const;
    }),
  );

  return new Map(entries);
}

interface HashDiff {
  changedPaths: Set<string>;
  removedPaths: Set<string>;
}

function diffHashes(storedHashes: Map<string, string> | null, currentHashes: Map<string, string>): HashDiff {
  if (storedHashes === null) {
    return { changedPaths: new Set(currentHashes.keys()), removedPaths: new Set() };
  }

  const changedPaths = new Set<string>();
  for (const [path, hash] of currentHashes) {
    if (storedHashes.get(path) !== hash) {
      changedPaths.add(path);
    }
  }

  const removedPaths = new Set<string>();
  for (const path of storedHashes.keys()) {
    if (!currentHashes.has(path)) {
      removedPaths.add(path);
    }
  }

  return { changedPaths, removedPaths };
}

async function writeFullAtomically(
  repositoryRoot: string,
  indexedFiles: string[],
  fileHashes: Map<string, string>,
  indexedFileSearchDocuments: Parameters<typeof writeIndexDatabase>[3],
  symbols: IndexedSymbol[],
  importRelationships: ImportRelationship[],
  callableFunctions: IndexedFunction[],
  callRelationships: CallRelationship[],
): Promise<void> {
  const indexPath = getIndexPath(repositoryRoot);
  const indexDirectory = path.dirname(indexPath);
  const temporaryIndexPath = path.join(indexDirectory, `index.db.tmp-${process.pid}-${Date.now()}`);

  await mkdir(indexDirectory, { recursive: true });

  try {
    await rm(temporaryIndexPath, { force: true });
    writeIndexDatabase(
      temporaryIndexPath,
      indexedFiles,
      fileHashes,
      indexedFileSearchDocuments,
      symbols,
      importRelationships,
      callableFunctions,
      callRelationships,
    );
    await rename(temporaryIndexPath, indexPath);
  } catch (error) {
    await rm(temporaryIndexPath, { force: true });
    throw error;
  }
}

async function writeIncrementallyAtomically(
  repositoryRoot: string,
  staleAndRemovedPaths: ReadonlySet<string>,
  indexedFiles: string[],
  fileHashes: Map<string, string>,
  indexedFileSearchDocuments: Parameters<typeof applyIncrementalUpdate>[4],
  symbols: IndexedSymbol[],
  importRelationships: ImportRelationship[],
  callableFunctions: IndexedFunction[],
  callRelationships: CallRelationship[],
): Promise<void> {
  const indexPath = getIndexPath(repositoryRoot);
  const indexDirectory = path.dirname(indexPath);
  const temporaryIndexPath = path.join(indexDirectory, `index.db.tmp-${process.pid}-${Date.now()}`);

  await mkdir(indexDirectory, { recursive: true });

  try {
    await copyFile(indexPath, temporaryIndexPath);
    applyIncrementalUpdate(
      temporaryIndexPath,
      staleAndRemovedPaths,
      indexedFiles,
      fileHashes,
      indexedFileSearchDocuments,
      symbols,
      importRelationships,
      callableFunctions,
      callRelationships,
    );
    await rename(temporaryIndexPath, indexPath);
  } catch (error) {
    await rm(temporaryIndexPath, { force: true });
    throw error;
  }
}
