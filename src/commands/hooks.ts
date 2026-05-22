import { HookPlatform, HooksInstallResponse, HooksUninstallResponse } from "../contracts";
import { installHooks, uninstallHooks } from "../lib/hooks";
import { toCliError } from "../lib/errors";
import { writeJson } from "../lib/output";

export async function runHooksInstallCommand(args: string[]): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const platformFlagIndex = args.indexOf("--platform");
  const platformArg =
    platformFlagIndex !== -1 ? (args[platformFlagIndex + 1] as HookPlatform | undefined) : undefined;

  const validPlatforms: HookPlatform[] = ["claude", "opencode", "copilot", "codex"];
  if (platformArg !== undefined && !validPlatforms.includes(platformArg)) {
    writeJson({
      status: "error",
      platforms: [],
      skipped: [],
      error: {
        code: "invalid_usage",
        message: `Unknown platform: ${platformArg}. Valid values: ${validPlatforms.join(", ")}.`,
      },
    } satisfies HooksInstallResponse);
    return 1;
  }

  const baseResponse: HooksInstallResponse = {
    status: "error",
    platforms: [],
    skipped: [],
  };

  try {
    const repoRoot = process.cwd();
    const result = await installHooks(repoRoot, { dryRun, platform: platformArg });
    writeJson({
      status: "ok",
      platforms: result.platforms,
      skipped: result.skipped,
    } satisfies HooksInstallResponse);
    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "hooks_install_failed"),
    });
    return 1;
  }
}

export async function runHooksUninstallCommand(args: string[]): Promise<number> {
  const dryRun = args.includes("--dry-run");
  const platformFlagIndex = args.indexOf("--platform");
  const platformArg =
    platformFlagIndex !== -1 ? (args[platformFlagIndex + 1] as HookPlatform | undefined) : undefined;

  const validPlatforms: HookPlatform[] = ["claude", "opencode", "copilot", "codex"];
  if (platformArg !== undefined && !validPlatforms.includes(platformArg)) {
    writeJson({
      status: "error",
      platforms: [],
      skipped: [],
      error: {
        code: "invalid_usage",
        message: `Unknown platform: ${platformArg}. Valid values: ${validPlatforms.join(", ")}.`,
      },
    } satisfies HooksUninstallResponse);
    return 1;
  }

  const baseResponse: HooksUninstallResponse = {
    status: "error",
    platforms: [],
    skipped: [],
  };

  try {
    const repoRoot = process.cwd();
    const result = await uninstallHooks(repoRoot, { dryRun, platform: platformArg });
    writeJson({
      status: "ok",
      platforms: result.platforms,
      skipped: result.skipped,
    } satisfies HooksUninstallResponse);
    return 0;
  } catch (error) {
    writeJson({
      ...baseResponse,
      error: toCliError(error, "hooks_uninstall_failed"),
    });
    return 1;
  }
}
