import { access } from "node:fs/promises";

import { CallRelationship, CallRelationshipsResponse } from "../contracts";
import { lookupCallRelationshipsByCalleeName, lookupCallRelationshipsByCallerName, lookupCallableFunctions } from "../lib/database";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";

type LookupCallRelationships = (databasePath: string, functionName: string) => CallRelationship[];

export async function runCallersCommand(query: string): Promise<number> {
  return await runCallRelationshipsCommand(query, lookupCallRelationshipsByCalleeName, "callers_failed");
}

export async function runCalleesCommand(query: string): Promise<number> {
  return await runCallRelationshipsCommand(query, lookupCallRelationshipsByCallerName, "callees_failed");
}

async function runCallRelationshipsCommand(
  query: string,
  lookupRelationships: LookupCallRelationships,
  fallbackCode: string,
): Promise<number> {
  const repositoryRoot = process.cwd();
  const indexPath = getIndexPath(repositoryRoot);
  const baseResponse: CallRelationshipsResponse = {
    query,
    status: "error",
    subjectCount: 0,
    subjects: [],
    relationshipCount: 0,
    relationships: [],
  };

  try {
    await ensureIndexExists(indexPath);

    const subjects = lookupCallableFunctions(indexPath, query);
    if (subjects.length === 0) {
      writeJson({
        query,
        status: "no_matches",
        subjectCount: 0,
        subjects: [],
        relationshipCount: 0,
        relationships: [],
      } satisfies CallRelationshipsResponse);
      return 0;
    }

    const relationships = lookupRelationships(indexPath, query);
    writeJson({
      query,
      status: "ok",
      subjectCount: subjects.length,
      subjects,
      relationshipCount: relationships.length,
      relationships,
    } satisfies CallRelationshipsResponse);

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
