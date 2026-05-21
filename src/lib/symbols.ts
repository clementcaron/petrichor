import ts from "typescript";

import { IndexedSymbol, SkippedFile, SymbolKind } from "../contracts";
import { toRepoRelativePath } from "./project";

interface ExtractionResult {
  indexedFileCount: number;
  skippedFiles: SkippedFile[];
  symbols: IndexedSymbol[];
}

export function extractSymbolsFromProgram(program: ts.Program, repositoryRoot: string): ExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const skippedFiles: SkippedFile[] = [];
  let indexedFileCount = 0;

  const rootFiles = program
    .getRootFileNames()
    .slice()
    .sort((left, right) => toRepoRelativePath(repositoryRoot, left).localeCompare(toRepoRelativePath(repositoryRoot, right)));

  for (const sourcePath of rootFiles) {
    const sourceFile = program.getSourceFile(sourcePath);
    const relativePath = toRepoRelativePath(repositoryRoot, sourcePath);

    if (!sourceFile) {
      skippedFiles.push({ path: relativePath, reason: "read_error" });
      continue;
    }

    if (program.getSyntacticDiagnostics(sourceFile).length > 0) {
      skippedFiles.push({ path: relativePath, reason: "parse_error" });
      continue;
    }

    indexedFileCount += 1;
    symbols.push(...extractSymbolsFromSourceFile(sourceFile, relativePath));
  }

  return { indexedFileCount, skippedFiles, symbols };
}

function extractSymbolsFromSourceFile(sourceFile: ts.SourceFile, relativePath: string): IndexedSymbol[] {
  const symbols: IndexedSymbol[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      symbols.push(createSymbol(statement.name, "class", relativePath, sourceFile, hasExportModifier(statement)));
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      symbols.push(createSymbol(statement.name, "enum", relativePath, sourceFile, hasExportModifier(statement)));
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      symbols.push(createSymbol(statement.name, "function", relativePath, sourceFile, hasExportModifier(statement)));
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      symbols.push(createSymbol(statement.name, "interface", relativePath, sourceFile, hasExportModifier(statement)));
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      symbols.push(createSymbol(statement.name, "type", relativePath, sourceFile, hasExportModifier(statement)));
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push(createSymbol(declaration.name, "variable", relativePath, sourceFile, hasExportModifier(statement)));
        }
      }
    }
  }

  return symbols;
}

function createSymbol(
  nameNode: ts.Identifier,
  kind: SymbolKind,
  relativePath: string,
  sourceFile: ts.SourceFile,
  exported: boolean,
): IndexedSymbol {
  const position = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));

  return {
    name: nameNode.text,
    kind,
    path: relativePath,
    line: position.line + 1,
    column: position.character + 1,
    exported,
  };
}

function hasExportModifier(node: { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
