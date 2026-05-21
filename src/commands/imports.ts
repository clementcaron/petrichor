import { access } from "node:fs/promises";

import { ImportRelationship, ImportRelationshipsResponse } from "../contracts";
import { lookupImportRelationshipsBySourcePath, lookupImportRelationshipsByTargetPath } from "../lib/database";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";

type LookupImportRelationships = (databasePath: string, repositoryPath: string) => ImportRelationship[];

export async function runImportsCommand(repositoryPath: string): Promise<number> {
  return await runImportRelationshipsCommand(repositoryPath, lookupImportRelationshipsBySourcePath, "imports_failed");
}

export async function runImportersCommand(repositoryPath: string): Promise<number> {
  return await runImportRelationshipsCommand(repositoryPath, lookupImportRelationshipsByTargetPath, "importers_failed");
}

async function runImportRelationshipsCommand(
  repositoryPath: string,
  lookupRelationships: LookupImportRelationships,
  fallbackCode: string,
): Promise<number> {
  const repositoryRoot = process.cwd();
  const indexPath = getIndexPath(repositoryRoot);
  const baseResponse: ImportRelationshipsResponse = {
    path: repositoryPath,
    status: "error",
    relationshipCount: 0,
    relationships: [],
  };

  try {
    await ensureIndexExists(indexPath);

    const relationships = lookupRelationships(indexPath, repositoryPath);
    writeJson({
      path: repositoryPath,
      status: "ok",
      relationshipCount: relationships.length,
      relationships,
    } satisfies ImportRelationshipsResponse);

    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, fallbackCode),
    });

    return 1;
  }
}

async function ensureIndexExists(indexPath: string): Promise<void> {
  try {
    await access(indexPath);
  } catch {
    throw new PetrichorError("missing_index", "No Repository Index found. Run `petrichor index` first.");
  }
}
