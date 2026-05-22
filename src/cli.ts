#!/usr/bin/env node

import { runCalleesCommand, runCallersCommand } from "./commands/calls";
import { runCapsuleCommand } from "./commands/capsule";
import { runIndexCommand } from "./commands/index";
import { runImportersCommand, runImportsCommand } from "./commands/imports";
import { runLookupCommand } from "./commands/lookup";
import { runSearchCommand } from "./commands/search";
import { toCliError } from "./lib/errors";
import { writeJson } from "./lib/output";

const HELP_TEXT = `Petrichor

Usage:
  petrichor index
  petrichor lookup <symbolName>
  petrichor search <query>
  petrichor imports <repositoryPath>
  petrichor importers <repositoryPath>
  petrichor callers <functionName>
  petrichor callees <functionName>
  petrichor capsule <repositoryPath>
  petrichor --help

Commands:
  index                    Build a Repository Index for the current directory (incremental by default, --full to rebuild)
  lookup <symbolName>      Look up exact symbol definitions in the Repository Index
  search <query>           Search the Repository Index with ranked mixed symbol and path results
  imports <repositoryPath> Look up repo-local import relationships from one indexed file
  importers <repositoryPath> Look up repo-local import relationships targeting one indexed file
  callers <functionName>   Look up direct repo-local callers for one exact function name
  callees <functionName>   Look up direct repo-local callees for one exact function name
  capsule <repositoryPath> Return a context capsule for one indexed Repository Path
`;

const INDEX_HELP_TEXT = `Usage:
  petrichor index [--full]

Build the Repository Index for the current working directory and print a JSON summary.
By default, only changed files are re-indexed. Use --full to force a complete rebuild.
`;

const LOOKUP_HELP_TEXT = `Usage:
  petrichor lookup <symbolName>

Run an exact, case-sensitive Definition Lookup against .petrichor/index.db.
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
  petrichor capsule <repositoryPath>

Run an exact Capsule Query against .petrichor/index.db for one indexed Repository Path.
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

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor lookup <symbolName>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runLookupCommand(arguments_[0]);
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

    if (arguments_.length !== 1) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "Usage: `petrichor capsule <repositoryPath>`.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runCapsuleCommand(arguments_[0]);
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
