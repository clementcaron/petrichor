import { RegistryListResponse, RegistryRemoveResponse } from "../contracts";
import { toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";
import { listRegisteredRepositories, removeRegisteredRepository } from "../lib/registry";

export async function runRegistryListCommand(): Promise<number> {
  try {
    const repositories = await listRegisteredRepositories();
    writeJson({
      status: "ok",
      repositoryCount: repositories.length,
      repositories,
    } satisfies RegistryListResponse);
    return 0;
  } catch (error) {
    writeJson({
      status: "error",
      repositoryCount: 0,
      repositories: [],
      error: toCliError(error, "registry_list_failed"),
    } satisfies RegistryListResponse);
    return 1;
  }
}

export async function runRegistryRemoveCommand(repositoryRoot: string): Promise<number> {
  try {
    const action = await removeRegisteredRepository(repositoryRoot);
    writeJson({ status: "ok", repositoryRoot, action } satisfies RegistryRemoveResponse);
    return 0;
  } catch (error) {
    writeJson({
      status: "error",
      repositoryRoot,
      error: toCliError(error, "registry_remove_failed"),
    } satisfies RegistryRemoveResponse);
    return 1;
  }
}
