#!/usr/bin/env node

import { runIndexCommand } from "./commands/index";
import { runLookupCommand } from "./commands/lookup";
import { toCliError } from "./lib/errors";
import { writeJson } from "./lib/output";

const HELP_TEXT = `Petrichor

Usage:
  petrichor index
  petrichor lookup <symbolName>
  petrichor --help

Commands:
  index               Build a Repository Index for the current directory
  lookup <symbolName> Look up exact symbol definitions in the Repository Index
`;

const INDEX_HELP_TEXT = `Usage:
  petrichor index

Build the Repository Index for the current working directory and print a JSON summary.
`;

const LOOKUP_HELP_TEXT = `Usage:
  petrichor lookup <symbolName>

Run an exact, case-sensitive Definition Lookup against .petrichor/index.db.
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
