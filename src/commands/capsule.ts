import { access } from "node:fs/promises";

import { CapsuleResponse } from "../contracts";
import { queryCapsule } from "../lib/capsule";
import { PetrichorError, toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { getIndexPath } from "../lib/project";

export async function runCapsuleCommand(repositoryPath: string): Promise<number> {
  const repositoryRoot = process.cwd();
  const indexPath = getIndexPath(repositoryRoot);
  const baseResponse: CapsuleResponse = {
    path: repositoryPath,
    status: "error",
    pivot: { source: "" },
    symbolCount: 0,
    symbols: [],
    neighborCount: 0,
    neighbors: [],
  };

  try {
    await ensureIndexExists(indexPath);

    const response = await queryCapsule(indexPath, repositoryRoot, repositoryPath);
    writeJson(response);

    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "capsule_failed"),
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
