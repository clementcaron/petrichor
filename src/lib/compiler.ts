import path from "node:path";
import ts from "typescript";

import { PetrichorError } from "./errors";

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
};

const CONFIG_FILENAMES = ["tsconfig.json", "jsconfig.json"];
const IGNORED_CONFIG_ERROR_CODES = new Set([18002, 18003]);

export function loadCompilerOptions(repositoryRoot: string): ts.CompilerOptions {
  const configPath = findConfigPath(repositoryRoot);

  if (!configPath) {
    return DEFAULT_COMPILER_OPTIONS;
  }

  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new PetrichorError("invalid_config", formatDiagnostic(readResult.error));
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    repositoryRoot,
    DEFAULT_COMPILER_OPTIONS,
    configPath,
  );

  const relevantErrors = parsedConfig.errors.filter((diagnostic) => !IGNORED_CONFIG_ERROR_CODES.has(diagnostic.code));
  if (relevantErrors.length > 0) {
    throw new PetrichorError("invalid_config", relevantErrors.map(formatDiagnostic).join("\n"));
  }

  return {
    ...DEFAULT_COMPILER_OPTIONS,
    ...parsedConfig.options,
    noEmit: true,
  };
}

function findConfigPath(repositoryRoot: string): string | undefined {
  for (const filename of CONFIG_FILENAMES) {
    const candidatePath = path.join(repositoryRoot, filename);
    if (ts.sys.fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
