import path from "node:path";
import ts from "typescript";

import { ImportRelationship, IndexedSymbol, SkippedFile, SymbolKind } from "../contracts";
import { toRepoRelativePath } from "./project";

interface ExtractionResult {
  importRelationships: ImportRelationship[];
  indexedFiles: string[];
  skippedFiles: SkippedFile[];
  symbols: IndexedSymbol[];
}

interface IndexedSourceFile {
  relativePath: string;
  sourceFile: ts.SourceFile;
  sourcePath: string;
}

interface CreateImportRelationshipOptions {
  compilerOptions: ts.CompilerOptions;
  indexedRootFileSet: ReadonlySet<string>;
  moduleSpecifier: ts.StringLiteralLike;
  repositoryRoot: string;
  sideEffect: boolean;
  sourceFile: ts.SourceFile;
  sourceRelativePath: string;
  syntax: ImportRelationship["syntax"];
  typeOnly: boolean;
}

export function extractIndexDataFromProgram(program: ts.Program, repositoryRoot: string): ExtractionResult {
  const compilerOptions = program.getCompilerOptions();
  const importRelationships: ImportRelationship[] = [];
  const indexedFiles: string[] = [];
  const indexedSourceFiles: IndexedSourceFile[] = [];
  const symbols: IndexedSymbol[] = [];
  const skippedFiles: SkippedFile[] = [];

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

    indexedSourceFiles.push({ relativePath, sourceFile, sourcePath });
  }

  const indexedRootFileSet = new Set(indexedSourceFiles.map((sourceFile) => normalizeFileSystemPath(sourceFile.sourcePath)));

  for (const indexedSourceFile of indexedSourceFiles) {
    indexedFiles.push(indexedSourceFile.relativePath);
    symbols.push(...extractSymbolsFromSourceFile(indexedSourceFile.sourceFile, indexedSourceFile.relativePath));
    importRelationships.push(
      ...extractImportRelationshipsFromSourceFile(
        indexedSourceFile.sourceFile,
        indexedSourceFile.relativePath,
        repositoryRoot,
        compilerOptions,
        indexedRootFileSet,
      ),
    );
  }

  return { importRelationships, indexedFiles, skippedFiles, symbols };
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

function extractImportRelationshipsFromSourceFile(
  sourceFile: ts.SourceFile,
  sourceRelativePath: string,
  repositoryRoot: string,
  compilerOptions: ts.CompilerOptions,
  indexedRootFileSet: ReadonlySet<string>,
): ImportRelationship[] {
  const relationships: ImportRelationship[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const relationship = createImportRelationship({
        compilerOptions,
        indexedRootFileSet,
        moduleSpecifier: statement.moduleSpecifier,
        repositoryRoot,
        sideEffect: statement.importClause === undefined,
        sourceFile,
        sourceRelativePath,
        syntax: "import",
        typeOnly: statement.importClause?.isTypeOnly ?? false,
      });

      if (relationship) {
        relationships.push(relationship);
      }

      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)) {
      const relationship = createImportRelationship({
        compilerOptions,
        indexedRootFileSet,
        moduleSpecifier: statement.moduleSpecifier,
        repositoryRoot,
        sideEffect: false,
        sourceFile,
        sourceRelativePath,
        syntax: "re_export",
        typeOnly: statement.isTypeOnly,
      });

      if (relationship) {
        relationships.push(relationship);
      }
    }
  }

  return relationships;
}

function createImportRelationship(options: CreateImportRelationshipOptions): ImportRelationship | undefined {
  const targetPath = resolveIndexedModuleTarget(
    options.moduleSpecifier.text,
    options.sourceFile.fileName,
    options.repositoryRoot,
    options.compilerOptions,
    options.indexedRootFileSet,
  );

  if (!targetPath) {
    return undefined;
  }

  const position = options.sourceFile.getLineAndCharacterOfPosition(options.moduleSpecifier.getStart(options.sourceFile));

  return {
    sourcePath: options.sourceRelativePath,
    targetPath,
    line: position.line + 1,
    column: position.character + 1,
    syntax: options.syntax,
    typeOnly: options.typeOnly,
    sideEffect: options.sideEffect,
  };
}

function resolveIndexedModuleTarget(
  moduleSpecifier: string,
  containingFile: string,
  repositoryRoot: string,
  compilerOptions: ts.CompilerOptions,
  indexedRootFileSet: ReadonlySet<string>,
): string | undefined {
  const resolvedModule = ts.resolveModuleName(moduleSpecifier, containingFile, compilerOptions, ts.sys).resolvedModule;

  if (!resolvedModule || resolvedModule.isExternalLibraryImport) {
    return undefined;
  }

  const normalizedResolvedPath = normalizeFileSystemPath(resolvedModule.resolvedFileName);
  if (!indexedRootFileSet.has(normalizedResolvedPath)) {
    return undefined;
  }

  return toRepoRelativePath(repositoryRoot, resolvedModule.resolvedFileName);
}

function normalizeFileSystemPath(candidatePath: string): string {
  const resolvedPath = path.resolve(candidatePath);
  return ts.sys.useCaseSensitiveFileNames ? resolvedPath : resolvedPath.toLowerCase();
}
