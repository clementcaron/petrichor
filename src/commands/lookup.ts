import { access } from "node:fs/promises";

import { GlobalLookupResponse, LookupResponse } from "../contracts";
import { lookupSymbols } from "../lib/database";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";
import { lookupAcrossRepositories } from "../lib/registry";

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

export async function runGlobalLookupCommand(query: string): Promise<number> {
  const baseResponse: GlobalLookupResponse = {
    query,
    status: "error",
    matchCount: 0,
    matches: [],
    skippedRepositories: [],
  };

  try {
    const result = await lookupAcrossRepositories(query);
    if (result.availableRepositoryCount === 0) {
      throw new PetrichorError("no_available_repositories", "No available Registered Repositories found.");
    }

    const status = result.skippedRepositories.length > 0
      ? "partial"
      : result.matches.length > 0 ? "ok" : "no_matches";
    writeJson({
      query,
      status,
      matchCount: result.matches.length,
      matches: result.matches,
      skippedRepositories: result.skippedRepositories,
    } satisfies GlobalLookupResponse);
    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "global_lookup_failed"),
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
