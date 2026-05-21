import { access } from "node:fs/promises";

import { LookupResponse } from "../contracts";
import { lookupSymbols } from "../lib/database";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";

export async function runLookupCommand(query: string): Promise<number> {
  const repositoryRoot = process.cwd();
  const indexPath = getIndexPath(repositoryRoot);
  const baseResponse: LookupResponse = {
    query,
    status: "error",
    matchCount: 0,
    matches: [],
  };

  try {
    await ensureIndexExists(indexPath);

    const matches = lookupSymbols(indexPath, query);
    if (matches.length === 0) {
      writeJson({
        query,
        status: "no_matches",
        matchCount: 0,
        matches: [],
      } satisfies LookupResponse);

      return 0;
    }

    writeJson({
      query,
      status: "ok",
      matchCount: matches.length,
      matches,
    } satisfies LookupResponse);

    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "lookup_failed"),
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
