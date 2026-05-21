#!/usr/bin/env node

import { runIndexCommand } from "./commands/index";
import { runImportersCommand, runImportsCommand } from "./commands/imports";
import { runLookupCommand } from "./commands/lookup";
import { toCliError } from "./lib/errors";
import { writeJson } from "./lib/output";

const HELP_TEXT = `Petrichor

Usage:
  petrichor index
  petrichor lookup <symbolName>
  petrichor imports <repositoryPath>
  petrichor importers <repositoryPath>
  petrichor --help

Commands:
  index                    Build a Repository Index for the current directory
  lookup <symbolName>      Look up exact symbol definitions in the Repository Index
  imports <repositoryPath> Look up repo-local import relationships from one indexed file
  importers <repositoryPath> Look up repo-local import relationships targeting one indexed file
`;

const INDEX_HELP_TEXT = `Usage:
  petrichor index

Build the Repository Index for the current working directory and print a JSON summary.
`;

const LOOKUP_HELP_TEXT = `Usage:
  petrichor lookup <symbolName>

Run an exact, case-sensitive Definition Lookup against .petrichor/index.db.
`;

const IMPORTS_HELP_TEXT = `Usage:
  petrichor imports <repositoryPath>

Run an exact Imports Query against .petrichor/index.db for one indexed Repository Path.
`;

const IMPORTERS_HELP_TEXT = `Usage:
  petrichor importers <repositoryPath>

Run an exact Importers Query against .petrichor/index.db for one indexed Repository Path.
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

    if (arguments_.length !== 0) {
      writeJson({
        status: "error",
        error: {
          code: "invalid_usage",
          message: "`petrichor index` does not accept additional arguments.",
        },
      });
      process.exitCode = 1;
      return;
    }

    process.exitCode = await runIndexCommand();
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
