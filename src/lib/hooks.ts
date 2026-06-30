import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  HookPlatform,
  HooksPlatformResult,
  HooksSkippedPlatform,
  HookType,
  HooksUninstallPlatformResult,
} from "../contracts";

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

interface PlatformDefinition {
  platform: HookPlatform;
  detectionDir: string;
  hookType: HookType;
  configPath: string;
  hookScriptName: string | null;
}

const PLATFORMS: PlatformDefinition[] = [
  {
    platform: "claude",
    detectionDir: ".claude",
    hookType: "runtime",
    configPath: ".claude/settings.json",
    hookScriptName: "claude.sh",
  },
  {
    platform: "opencode",
    detectionDir: ".opencode",
    hookType: "runtime",
    configPath: ".opencode/settings.json",
    hookScriptName: "opencode.sh",
  },
  {
    platform: "copilot",
    detectionDir: ".github",
    hookType: "instruction",
    configPath: ".github/copilot-instructions.md",
    hookScriptName: null,
  },
  {
    platform: "codex",
    detectionDir: ".codex",
    hookType: "instruction",
    configPath: "AGENTS.md",
    hookScriptName: null,
  },
];

// ---------------------------------------------------------------------------
// Hook script content
// ---------------------------------------------------------------------------

function runtimeHookScript(platform: string): string {
  return [
    "#!/usr/bin/env bash",
    `# Petrichor — ${platform} PreToolUse hook`,
    "# Intercepts Read tool calls and substitutes a petrichor capsule for indexed TypeScript files.",
    "",
    'FILE_PATH=$(node -e "',
    "process.stdin.setEncoding('utf8');",
    "let data = '';",
    "process.stdin.on('data', d => data += d);",
    "process.stdin.on('end', () => {",
    "  try {",
    "    const input = JSON.parse(data);",
    "    process.stdout.write(input.tool_input?.file_path || '');",
    "  } catch { process.stdout.write(''); }",
    "});",
    '")',
    "",
    '[ -z "$FILE_PATH" ] && exit 0',
    "",
    'REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)',
    'REL_PATH="${FILE_PATH#${REPO_ROOT}/}"',
    '[ "$REL_PATH" = "$FILE_PATH" ] && exit 0',
    "",
    'case "$REL_PATH" in',
    "  *.ts|*.tsx) ;;",
    "  *) exit 0 ;;",
    "esac",
    "",
    'CAPSULE=$(cd "$REPO_ROOT" && npx --no petrichor capsule "$REL_PATH" 2>/dev/null)',
    "CAPSULE_STATUS=$?",
    'if [ "$CAPSULE_STATUS" -ne 0 ]; then',
    '  [ -z "$CAPSULE" ] && exit 0',
    '  ERROR_CODE=$(printf "%s" "$CAPSULE" | node -e "',
    "let data = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => data += chunk);",
    "process.stdin.on('end', () => {",
    "  try { process.stdout.write(JSON.parse(data).error?.code || ''); } catch {}",
    "});",
    '")',
    '  case "$ERROR_CODE" in',
    "    missing_index|path_not_indexed) exit 0 ;;",
    "    '') exit 0 ;;",
    "  esac",
    '  echo "$CAPSULE"',
    "  exit 2",
    "fi",
    "",
    'echo "$CAPSULE"',
    "exit 2",
    "",
  ].join("\n");
}

const INSTRUCTION_BLOCK = [
  "<!-- petrichor-start -->",
  "## Petrichor",
  "",
  "When reading TypeScript (`.ts`) or TSX (`.tsx`) source files, prefer `petrichor capsule <repositoryPath>` over reading the file directly.",
  "It returns the full source of the pivot file plus skeletonized signatures for all directly related neighbor files — more structural signal in less context.",
  "",
  "Only fall back to a direct file read if petrichor is unavailable or the file is not indexed.",
  "<!-- petrichor-end -->",
].join("\n");

const PETRICHOR_MARKER = "<!-- petrichor-start -->";

// ---------------------------------------------------------------------------
// Runtime hook helpers (JSON config platforms)
// ---------------------------------------------------------------------------

interface RuntimeHookConfig {
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
  [key: string]: unknown;
}

function hasPetrichorEntry(config: RuntimeHookConfig): boolean {
  return (
    config.hooks?.PreToolUse?.some((entry) =>
      entry.hooks?.some((h) => h.command?.includes("petrichor")),
    ) ?? false
  );
}

function injectPetrichorEntry(config: RuntimeHookConfig, hookScriptPath: string): void {
  if (!config.hooks) config.hooks = {};
  if (!config.hooks.PreToolUse) config.hooks.PreToolUse = [];
  config.hooks.PreToolUse.push({
    matcher: "Read",
    hooks: [{ type: "command", command: hookScriptPath }],
  });
}

async function installRuntimeHook(
  repoRoot: string,
  def: PlatformDefinition,
  dryRun: boolean,
): Promise<HooksPlatformResult> {
  const hookScriptRelPath = `.petrichor/hooks/${def.hookScriptName}`;
  const hookScriptAbsPath = path.join(repoRoot, hookScriptRelPath);
  const configAbsPath = path.join(repoRoot, def.configPath);

  if (!dryRun) {
    await mkdir(path.dirname(hookScriptAbsPath), { recursive: true });
    await writeFile(hookScriptAbsPath, runtimeHookScript(def.platform), "utf8");
    await chmod(hookScriptAbsPath, 0o755);

    let config: RuntimeHookConfig = {};
    if (existsSync(configAbsPath)) {
      try {
        config = JSON.parse(await readFile(configAbsPath, "utf8")) as RuntimeHookConfig;
      } catch {
        // malformed JSON — start fresh with hooks added
      }
    }

    if (!hasPetrichorEntry(config)) {
      injectPetrichorEntry(config, hookScriptRelPath);
      await mkdir(path.dirname(configAbsPath), { recursive: true });
      await writeFile(configAbsPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    }
  }

  return {
    platform: def.platform,
    hookType: "runtime",
    configPath: def.configPath,
    hookScript: hookScriptRelPath,
    action: dryRun ? "would_write" : "written",
  };
}

// ---------------------------------------------------------------------------
// Instruction hook helpers (Markdown platforms)
// ---------------------------------------------------------------------------

async function installInstructionHook(
  repoRoot: string,
  def: PlatformDefinition,
  dryRun: boolean,
): Promise<HooksPlatformResult> {
  const configAbsPath = path.join(repoRoot, def.configPath);

  if (!dryRun) {
    let existing = "";
    if (existsSync(configAbsPath)) {
      existing = await readFile(configAbsPath, "utf8");
    }

    if (!existing.includes(PETRICHOR_MARKER)) {
      const separator = existing.length > 0 && !existing.endsWith("\n\n") ? "\n\n" : "";
      await mkdir(path.dirname(configAbsPath), { recursive: true });
      await writeFile(configAbsPath, existing + separator + INSTRUCTION_BLOCK + "\n", "utf8");
    }
  }

  return {
    platform: def.platform,
    hookType: "instruction",
    configPath: def.configPath,
    hookScript: null,
    action: dryRun ? "would_write" : "written",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InstallHooksOptions {
  dryRun?: boolean;
  platform?: HookPlatform;
}

export interface InstallHooksResult {
  platforms: HooksPlatformResult[];
  skipped: HooksSkippedPlatform[];
}

export async function installHooks(
  repoRoot: string,
  options: InstallHooksOptions = {},
): Promise<InstallHooksResult> {
  const { dryRun = false, platform: targetPlatform } = options;

  const platforms: HooksPlatformResult[] = [];
  const skipped: HooksSkippedPlatform[] = [];

  const defs = targetPlatform ? PLATFORMS.filter((p) => p.platform === targetPlatform) : PLATFORMS;

  for (const def of defs) {
    if (!existsSync(path.join(repoRoot, def.detectionDir))) {
      skipped.push({ platform: def.platform, reason: "not_detected" });
      continue;
    }

    const result =
      def.hookType === "runtime"
        ? await installRuntimeHook(repoRoot, def, dryRun)
        : await installInstructionHook(repoRoot, def, dryRun);

    platforms.push(result);
  }

  return { platforms, skipped };
}

// ---------------------------------------------------------------------------
// Uninstall helpers
// ---------------------------------------------------------------------------

async function uninstallRuntimeHook(
  repoRoot: string,
  def: PlatformDefinition,
  dryRun: boolean,
): Promise<HooksUninstallPlatformResult> {
  const hookScriptRelPath = `.petrichor/hooks/${def.hookScriptName}`;
  const hookScriptAbsPath = path.join(repoRoot, hookScriptRelPath);
  const configAbsPath = path.join(repoRoot, def.configPath);

  const scriptExists = existsSync(hookScriptAbsPath);
  let config: RuntimeHookConfig = {};
  let configHasPetrichor = false;
  if (existsSync(configAbsPath)) {
    try {
      config = JSON.parse(await readFile(configAbsPath, "utf8")) as RuntimeHookConfig;
      configHasPetrichor = hasPetrichorEntry(config);
    } catch {
      // malformed JSON — treat as not installed
    }
  }

  if (!scriptExists && !configHasPetrichor) {
    return { platform: def.platform, hookType: "runtime", configPath: def.configPath, hookScript: hookScriptRelPath, action: "not_installed" };
  }

  if (!dryRun) {
    if (scriptExists) {
      await unlink(hookScriptAbsPath);
    }
    if (configHasPetrichor && config.hooks?.PreToolUse) {
      config.hooks.PreToolUse = config.hooks.PreToolUse.filter(
        (entry) => !entry.hooks?.some((h) => h.command?.includes("petrichor")),
      );
      if (config.hooks.PreToolUse.length === 0) delete config.hooks.PreToolUse;
      if (Object.keys(config.hooks).length === 0) delete config.hooks;
      await writeFile(configAbsPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    }
  }

  return { platform: def.platform, hookType: "runtime", configPath: def.configPath, hookScript: hookScriptRelPath, action: dryRun ? "would_remove" : "removed" };
}

async function uninstallInstructionHook(
  repoRoot: string,
  def: PlatformDefinition,
  dryRun: boolean,
): Promise<HooksUninstallPlatformResult> {
  const configAbsPath = path.join(repoRoot, def.configPath);

  if (!existsSync(configAbsPath)) {
    return { platform: def.platform, hookType: "instruction", configPath: def.configPath, hookScript: null, action: "not_installed" };
  }

  const existing = await readFile(configAbsPath, "utf8");
  if (!existing.includes(PETRICHOR_MARKER)) {
    return { platform: def.platform, hookType: "instruction", configPath: def.configPath, hookScript: null, action: "not_installed" };
  }

  if (!dryRun) {
    // Remove the block including any leading double-newline separator
    let updated = existing.replace(/\n\n<!-- petrichor-start -->[\s\S]*?<!-- petrichor-end -->\n?/, "");
    if (updated === existing) {
      updated = existing.replace(/<!-- petrichor-start -->[\s\S]*?<!-- petrichor-end -->\n?/, "");
    }
    await writeFile(configAbsPath, updated, "utf8");
  }

  return { platform: def.platform, hookType: "instruction", configPath: def.configPath, hookScript: null, action: dryRun ? "would_remove" : "removed" };
}

export interface UninstallHooksOptions {
  dryRun?: boolean;
  platform?: HookPlatform;
}

export interface UninstallHooksResult {
  platforms: HooksUninstallPlatformResult[];
  skipped: HooksSkippedPlatform[];
}

export async function uninstallHooks(
  repoRoot: string,
  options: UninstallHooksOptions = {},
): Promise<UninstallHooksResult> {
  const { dryRun = false, platform: targetPlatform } = options;

  const platforms: HooksUninstallPlatformResult[] = [];
  const skipped: HooksSkippedPlatform[] = [];

  const defs = targetPlatform ? PLATFORMS.filter((p) => p.platform === targetPlatform) : PLATFORMS;

  for (const def of defs) {
    if (!existsSync(path.join(repoRoot, def.detectionDir))) {
      skipped.push({ platform: def.platform, reason: "not_detected" });
      continue;
    }

    const result =
      def.hookType === "runtime"
        ? await uninstallRuntimeHook(repoRoot, def, dryRun)
        : await uninstallInstructionHook(repoRoot, def, dryRun);

    platforms.push(result);
  }

  return { platforms, skipped };
}
