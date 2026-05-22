import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import { CallRelationship, ImportRelationship, IndexedFunction, IndexResponse, IndexedSymbol } from "../contracts";
import { loadCompilerOptions } from "../lib/compiler";
import { writeIndexDatabase } from "../lib/database";
import { toCliError } from "../lib/errors";
import { collectSourceFiles } from "../lib/files";
import { writeJson } from "../lib/output";
import { getIndexPath, INDEX_RELATIVE_PATH } from "../lib/project";
import { extractIndexDataFromProgram } from "../lib/symbols";

export async function runIndexCommand(): Promise<number> {
  const repositoryRoot = process.cwd();
  const baseResponse: IndexResponse = {
    status: "error",
    indexPath: INDEX_RELATIVE_PATH,
    fileCount: 0,
    symbolCount: 0,
    skippedFileCount: 0,
    skippedFiles: [],
  };

  try {
    const sourceFiles = await collectSourceFiles(repositoryRoot);
    const compilerOptions = loadCompilerOptions(repositoryRoot);
    const program = ts.createProgram({
      options: compilerOptions,
      rootNames: sourceFiles,
    });
    const extraction = extractIndexDataFromProgram(program, repositoryRoot);

    await writeIndexAtomically(
      repositoryRoot,
      extraction.indexedFiles,
      extraction.indexedFileSearchDocuments,
      extraction.symbols,
      extraction.importRelationships,
      extraction.callableFunctions,
      extraction.callRelationships,
    );

    writeJson({
      status: extraction.skippedFiles.length > 0 ? "partial" : "ok",
      indexPath: INDEX_RELATIVE_PATH,
      fileCount: extraction.indexedFiles.length,
      symbolCount: extraction.symbols.length,
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

async function writeIndexAtomically(
  repositoryRoot: string,
  indexedFiles: string[],
  indexedFileSearchDocuments: Parameters<typeof writeIndexDatabase>[2],
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
