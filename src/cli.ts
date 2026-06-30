#!/usr/bin/env node

import { runCalleesCommand, runCallersCommand } from "./commands/calls";
import { runCapsuleCommand, runGlobalCapsuleCommand } from "./commands/capsule";
import { runHooksInstallCommand, runHooksUninstallCommand } from "./commands/hooks";
import { runIndexCommand } from "./commands/index";
import { runImportersCommand, runImportsCommand } from "./commands/imports";
import { runGlobalLookupCommand, runLookupCommand } from "./commands/lookup";
import { runRegistryListCommand, runRegistryRemoveCommand } from "./commands/registry";
import { runSearchCommand } from "./commands/search";
import { runSessionGuideCommand, runSessionRecordCommand } from "./commands/session";
import { toCliError } from "./lib/errors";
import { writeJson } from "./lib/output";

const HELP_TEXT = `Petrichor

Usage:
  petrichor index
  petrichor lookup <symbolName> [--all]
  petrichor search <query>
  petrichor imports <repositoryPath>
  petrichor importers <repositoryPath>
  petrichor callers <functionName>
  petrichor callees <functionName>
  petrichor capsule <repositoryPath> [--repository <canonicalRoot>]
  petrichor registry list
  petrichor registry remove <canonicalRoot>
  petrichor session record --session <id>
  petrichor session guide --session <id>
  petrichor hooks install [--dry-run] [--platform <name>]
  petrichor --help

Commands:
  index                    Build a Repository Index for the current directory (incremental by default, --full to rebuild)
  lookup <symbolName>      Look up exact symbol definitions locally or across all Registered Repositories
  search <query>           Search the Repository Index with ranked mixed symbol and path results
  imports <repositoryPath> Look up repo-local import relationships from one indexed file
  importers <repositoryPath> Look up repo-local import relationships targeting one indexed file
  callers <functionName>   Look up direct repo-local callers for one exact function name
  callees <functionName>   Look up direct repo-local callees for one exact function name
  capsule <repositoryPath> Return a Context Capsule locally or from one Registered Repository
  registry list            List Registered Repositories and their availability
  registry remove          Remove a Repository from the Global Registry
  session record           Record one structured Session Event from JSON on stdin
  session guide            Return the current Session Guide for a Coding Session
  hooks install            Install Petrichor hooks into detected coding agent platforms
`;

const INDEX_HELP_TEXT = `Usage:
  petrichor index [--full]

Build the Repository Index for the current working directory and print a JSON summary.
By default, only changed files are re-indexed. Use --full to force a complete rebuild.
`;

const LOOKUP_HELP_TEXT = `Usage:
  petrichor lookup <symbolName> [--all]

Run an exact, case-sensitive Definition Lookup. Use --all to query all available Registered Repositories.
`;

const SEARCH_HELP_TEXT = `Usage:
  petrichor search <query>

Run an exploratory Search Query against .petrichor/index.db with ranked symbol and Repository Path results.
`;

const IMPORTS_HELP_TEXT = `Usage:
  petrichor imports <repositoryPath>

Run an exact Imports Query against .petrichor/index.db for one indexed Repository Path.
`;

const IMPORTERS_HELP_TEXT = `Usage:
  petrichor importers <repositoryPath>

Run an exact Importers Query against .petrichor/index.db for one indexed Repository Path.
`;

const CALLERS_HELP_TEXT = `Usage:
  petrichor callers <functionName>

Run an exact, case-sensitive Callers Query against .petrichor/index.db for one indexed function name.
`;

const CALLEES_HELP_TEXT = `Usage:
  petrichor callees <functionName>

Run an exact, case-sensitive Callees Query against .petrichor/index.db for one indexed function name.
`;

const CAPSULE_HELP_TEXT = `Usage:
  petrichor capsule <repositoryPath> [--repository <canonicalRoot>]

Run an exact Capsule Query locally or against one Registered Repository selected by canonical root.
`;

const REGISTRY_HELP_TEXT = `Usage:
  petrichor registry list
  petrichor registry remove <canonicalRoot>

List Registered Repositories or remove one exact canonical root from the Global Registry.
`;

async function main(): Promise<void> {
  const [command, ...arguments_] = process.argv.slice(2);

  if (!command || isHelpFlag(command)) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  if (command === "index") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(INDEX_HELP_TEXT);
      return;
    }

    const isFullFlag = (value: string) => value === "--full";

    if (arguments_.length > 1 || (arguments_.length === 1 && !isFullFlag(arguments_[0]))) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "`petrichor index` only accepts an optional `--full` flag.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runIndexCommand(arguments_.length === 1 && isFullFlag(arguments_[0]));
    return;
  }

  if (command === "lookup") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(LOOKUP_HELP_TEXT);
      return;
    }

    if (arguments_.length === 2 && arguments_[1] === "--all") {
      process.exitCode = await runGlobalLookupCommand(arguments_[0]);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor lookup <symbolName> [--all]`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runLookupCommand(arguments_[0]);
    return;
  }

  if (command === "registry") {
    if (arguments_.length === 0 || (arguments_.length === 1 && isHelpFlag(arguments_[0]))) {
      process.stdout.write(REGISTRY_HELP_TEXT);
      return;
    }
    if (arguments_.length === 1 && arguments_[0] === "list") {
      process.exitCode = await runRegistryListCommand();
      return;
    }

    if (arguments_.length === 2 && arguments_[0] === "remove") {
      process.exitCode = await runRegistryRemoveCommand(arguments_[1]);
      return;
    }

    writeJson({
      status: "error",
      error: {
        code: "invalid_usage",
        message: "Usage: `petrichor registry <list|remove <canonicalRoot>>`.",
      },
    });
    process.exitCode = 1;
    return;
  }

  if (command === "search") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(SEARCH_HELP_TEXT);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor search <query>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runSearchCommand(arguments_[0]);
    return;
  }

  if (command === "imports") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(IMPORTS_HELP_TEXT);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor imports <repositoryPath>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runImportsCommand(arguments_[0]);
    return;
  }

  if (command === "importers") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(IMPORTERS_HELP_TEXT);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor importers <repositoryPath>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runImportersCommand(arguments_[0]);
    return;
  }

  if (command === "callers") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(CALLERS_HELP_TEXT);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor callers <functionName>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runCallersCommand(arguments_[0]);
    return;
  }

  if (command === "callees") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(CALLEES_HELP_TEXT);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor callees <functionName>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runCalleesCommand(arguments_[0]);
    return;
  }

  if (command === "capsule") {
    if (arguments_.length === 1 && isHelpFlag(arguments_[0])) {
      process.stdout.write(CAPSULE_HELP_TEXT);
      return;
    }

    if (arguments_.length === 3 && arguments_[1] === "--repository") {
      process.exitCode = await runGlobalCapsuleCommand(arguments_[0], arguments_[2]);
      return;
    }

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor capsule <repositoryPath> [--repository <canonicalRoot>]`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runCapsuleCommand(arguments_[0]);
    return;
  }

  if (command === "hooks") {
    const subcommand = arguments_[0];

    if (!subcommand || isHelpFlag(subcommand)) {
      process.stdout.write(
        `Usage:\n  petrichor hooks install [--dry-run] [--platform <name>]\n  petrichor hooks uninstall [--dry-run] [--platform <name>]\n\nSubcommands:\n  install      Install Petrichor hooks into detected coding agent platforms\n  uninstall    Remove Petrichor hooks from detected coding agent platforms\n`,
      );
      return;
    }

    if (subcommand === "install") {
      process.exitCode = await runHooksInstallCommand(arguments_.slice(1));
      return;
    }

    if (subcommand === "uninstall") {
      process.exitCode = await runHooksUninstallCommand(arguments_.slice(1));
      return;
    }

    writeJson({
      status: "error",
      error: {
        code: "invalid_usage",
        message: `Unknown hooks subcommand: ${subcommand}. Valid subcommands: install, uninstall.`,
      },
    });
    process.exitCode = 1;
    return;
  }

  if (command === "session") {
    const [subcommand, flag, sessionId, ...extraArguments] = arguments_;
    if (!subcommand || isHelpFlag(subcommand)) {
      process.stdout.write(
        "Usage:\n  petrichor session record --session <id>\n  petrichor session guide --session <id>\n",
      );
      return;
    }

    if (
      (subcommand !== "record" && subcommand !== "guide")
      || flag !== "--session"
      || sessionId === undefined
      || extraArguments.length > 0
    ) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor session <record|guide> --session <id>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = subcommand === "record"
      ? await runSessionRecordCommand(sessionId)
      : runSessionGuideCommand(sessionId);
    return;
  }

  writeJson({
    status: "error",
    error: {
      code: "invalid_usage",
      message: `Unknown command: ${command}.`,
    },
  });
  process.exitCode = 1;
}

function isHelpFlag(value: string): boolean {
  return value === "-h" || value === "--help";
}

void main().catch((error) => {
  writeJson({
    status: "error",
    error: toCliError(error),
  });
  process.exitCode = 1;
});
