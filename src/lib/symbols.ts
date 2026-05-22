import path from "node:path";
import ts from "typescript";

import { CallRelationship, IndexedFunction, ImportRelationship, IndexedSymbol, SkippedFile, SymbolKind } from "../contracts";
import { toRepoRelativePath } from "./project";

interface ExtractionResult {
  callRelationships: CallRelationship[];
  callableFunctions: IndexedFunction[];
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

interface CallableFunctionDeclaration {
  declaration: ts.FunctionDeclaration;
  symbol: IndexedFunction;
}

interface SourceFileSymbolExtraction {
  callableFunctions: CallableFunctionDeclaration[];
  symbols: IndexedSymbol[];
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
  const checker = program.getTypeChecker();
  const compilerOptions = program.getCompilerOptions();
  const callRelationships: CallRelationship[] = [];
  const callableFunctionDeclarations: CallableFunctionDeclaration[] = [];
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

    const extractedSymbols = extractSymbolsFromSourceFile(indexedSourceFile.sourceFile, indexedSourceFile.relativePath);
    symbols.push(...extractedSymbols.symbols);
    callableFunctionDeclarations.push(...extractedSymbols.callableFunctions);

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

  const callableFunctionByDeclaration = new Map<ts.FunctionDeclaration, IndexedFunction>(
    callableFunctionDeclarations.map((callableFunction) => [callableFunction.declaration, callableFunction.symbol]),
  );

  for (const indexedSourceFile of indexedSourceFiles) {
    callRelationships.push(
      ...extractCallRelationshipsFromSourceFile(indexedSourceFile.sourceFile, checker, callableFunctionByDeclaration),
    );
  }

  return {
    callRelationships,
    callableFunctions: callableFunctionDeclarations.map((callableFunction) => callableFunction.symbol),
    importRelationships,
    indexedFiles,
    skippedFiles,
    symbols,
  };
}

function extractSymbolsFromSourceFile(sourceFile: ts.SourceFile, relativePath: string): SourceFileSymbolExtraction {
  const callableFunctions: CallableFunctionDeclaration[] = [];
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
      const functionSymbol = createFunctionSymbol(statement.name, relativePath, sourceFile, hasExportModifier(statement));
      symbols.push(functionSymbol);

      if (statement.body) {
        callableFunctions.push({
          declaration: statement,
          symbol: functionSymbol,
        });
      }

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

  return { callableFunctions, symbols };
}

function createFunctionSymbol(
  nameNode: ts.Identifier,
  relativePath: string,
  sourceFile: ts.SourceFile,
  exported: boolean,
): IndexedFunction {
  const position = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));

  return {
    name: nameNode.text,
    kind: "function",
    path: relativePath,
    line: position.line + 1,
    column: position.character + 1,
    exported,
  };
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

function extractCallRelationshipsFromSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  callableFunctionByDeclaration: ReadonlyMap<ts.FunctionDeclaration, IndexedFunction>,
): CallRelationship[] {
  const relationships: CallRelationship[] = [];

  function visit(node: ts.Node, currentCaller: IndexedFunction | undefined): void {
    if (node !== sourceFile && ts.isFunctionLike(node)) {
      const nextCaller = ts.isFunctionDeclaration(node) ? callableFunctionByDeclaration.get(node) : undefined;
      ts.forEachChild(node, (child) => visit(child, nextCaller));
      return;
    }

    if (currentCaller && ts.isCallExpression(node)) {
      const callee = resolveCallableFunctionFromCallExpression(node, checker, callableFunctionByDeclaration);
      if (callee) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile));
        relationships.push({
          caller: currentCaller,
          callee,
          callSite: {
            line: position.line + 1,
            column: position.character + 1,
          },
        });
      }
    }

    ts.forEachChild(node, (child) => visit(child, currentCaller));
  }

  visit(sourceFile, undefined);
  return relationships;
}

function resolveCallableFunctionFromCallExpression(
  callExpression: ts.CallExpression,
  checker: ts.TypeChecker,
  callableFunctionByDeclaration: ReadonlyMap<ts.FunctionDeclaration, IndexedFunction>,
): IndexedFunction | undefined {
  const signature = checker.getResolvedSignature(callExpression);
  const fromSignature = resolveCallableFunctionFromDeclaration(signature?.getDeclaration(), checker, callableFunctionByDeclaration);
  if (fromSignature) {
    return fromSignature;
  }

  const symbolNode = getCallTargetNode(callExpression.expression);
  const symbol = checker.getSymbolAtLocation(symbolNode);
  return resolveCallableFunctionFromSymbol(symbol, checker, callableFunctionByDeclaration);
}

function resolveCallableFunctionFromDeclaration(
  declaration: ts.Declaration | undefined,
  checker: ts.TypeChecker,
  callableFunctionByDeclaration: ReadonlyMap<ts.FunctionDeclaration, IndexedFunction>,
): IndexedFunction | undefined {
  if (!declaration) {
    return undefined;
  }

  if (ts.isFunctionDeclaration(declaration) && declaration.body) {
    return callableFunctionByDeclaration.get(declaration);
  }

  const symbol = getDeclarationSymbol(declaration, checker);
  return resolveCallableFunctionFromSymbol(symbol, checker, callableFunctionByDeclaration);
}

function resolveCallableFunctionFromSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  callableFunctionByDeclaration: ReadonlyMap<ts.FunctionDeclaration, IndexedFunction>,
): IndexedFunction | undefined {
  if (!symbol) {
    return undefined;
  }

  const visitedSymbols = new Set<ts.Symbol>();
  let currentSymbol: ts.Symbol = symbol;

  while ((currentSymbol.flags & ts.SymbolFlags.Alias) !== 0 && !visitedSymbols.has(currentSymbol)) {
    visitedSymbols.add(currentSymbol);
    currentSymbol = checker.getAliasedSymbol(currentSymbol);
  }

  return (
    findCallableFunctionInDeclarations(currentSymbol.declarations, callableFunctionByDeclaration) ??
    findCallableFunctionInDeclarations(
      currentSymbol.valueDeclaration ? [currentSymbol.valueDeclaration] : undefined,
      callableFunctionByDeclaration,
    )
  );
}

function findCallableFunctionInDeclarations(
  declarations: readonly ts.Declaration[] | undefined,
  callableFunctionByDeclaration: ReadonlyMap<ts.FunctionDeclaration, IndexedFunction>,
): IndexedFunction | undefined {
  if (!declarations) {
    return undefined;
  }

  for (const declaration of declarations) {
    if (ts.isFunctionDeclaration(declaration) && declaration.body) {
      const callableFunction = callableFunctionByDeclaration.get(declaration);
      if (callableFunction) {
        return callableFunction;
      }
    }
  }

  return undefined;
}

function getDeclarationSymbol(declaration: ts.Declaration, checker: ts.TypeChecker): ts.Symbol | undefined {
  const declarationName = (declaration as ts.NamedDeclaration).name;
  if (declarationName && ts.isIdentifier(declarationName)) {
    return checker.getSymbolAtLocation(declarationName);
  }

  return undefined;
}

function getCallTargetNode(expression: ts.LeftHandSideExpression): ts.Node {
  const unwrappedExpression = unwrapCallTargetExpression(expression);

  if (ts.isPropertyAccessExpression(unwrappedExpression)) {
    return unwrappedExpression.name;
  }

  if (ts.isElementAccessExpression(unwrappedExpression)) {
    return unwrappedExpression.argumentExpression ?? unwrappedExpression.expression;
  }

  return unwrappedExpression;
}

function unwrapCallTargetExpression(expression: ts.LeftHandSideExpression): ts.LeftHandSideExpression {
  let currentExpression: ts.Expression = expression;

  while (true) {
    if (ts.isParenthesizedExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isAsExpression(currentExpression) || ts.isSatisfiesExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isTypeAssertionExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isNonNullExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    if (ts.isPartiallyEmittedExpression(currentExpression)) {
      currentExpression = currentExpression.expression;
      continue;
    }

    return currentExpression as ts.LeftHandSideExpression;
  }
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
