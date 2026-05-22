import { access } from "node:fs/promises";

import { SearchResponse } from "../contracts";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";
import { runSearchQuery } from "../lib/search";

const DEFAULT_SEARCH_LIMIT = 10;

export async function runSearchCommand(query: string): Promise<number> {
  const repositoryRoot = process.cwd();
  const indexPath = getIndexPath(repositoryRoot);
  const baseResponse: SearchResponse = {
    query,
    status: "error",
    resultCount: 0,
    results: [],
  };

  try {
    await ensureIndexExists(indexPath);

    const results = runSearchQuery(indexPath, query, DEFAULT_SEARCH_LIMIT);
    if (results.length === 0) {
      writeJson({
        query,
        status: "no_matches",
        resultCount: 0,
        results: [],
      } satisfies SearchResponse);

      return 0;
    }

    writeJson({
      query,
      status: "ok",
      resultCount: results.length,
      results,
    } satisfies SearchResponse);

    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "search_failed"),
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
