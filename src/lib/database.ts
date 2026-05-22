import Database from "better-sqlite3";

import {
  CallRelationship,
  IndexedFunction,
  ImportRelationship,
  IndexedSymbol,
} from "../contracts";
import { PetrichorError } from "./errors";
import { IndexedFileSearchDocument } from "./symbols";

interface SymbolRow {
  column: number;
  exported: number;
  kind: IndexedSymbol["kind"];
  line: number;
  name: string;
  path: string;
}

interface ImportRelationshipRow {
  column: number;
  is_side_effect: number;
  is_type_only: number;
  line: number;
  source_path: string;
  syntax: ImportRelationship["syntax"];
  target_path: string;
}

interface CallableFunctionRow {
  column: number;
  exported: number;
  line: number;
  name: string;
  path: string;
}

interface CallRelationshipRow {
  call_site_column: number;
  call_site_line: number;
  callee_column: number;
  callee_exported: number;
  callee_line: number;
  callee_name: string;
  callee_path: string;
  caller_column: number;
  caller_exported: number;
  caller_line: number;
  caller_name: string;
  caller_path: string;
}

export interface SearchCandidate {
  resultType: "path" | "symbol";
  path: string;
  symbolName: string | null;
  symbolNames: string | null;
  symbolKind: IndexedSymbol["kind"] | null;
  line: number | null;
  column: number | null;
  exported: number | null;
  structuralText: string;
  contentText: string;
  relevance: number;
}

export function writeIndexDatabase(
  databasePath: string,
  indexedFiles: string[],
  indexedFileHashes: Map<string, string>,
  indexedFileSearchDocuments: IndexedFileSearchDocument[],
  symbols: IndexedSymbol[],
  importRelationships: ImportRelationship[],
  callableFunctions: IndexedFunction[],
  callRelationships: CallRelationship[],
): void {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE indexed_files (
        path TEXT NOT NULL PRIMARY KEY,
        content_hash TEXT NOT NULL
      );

      CREATE TABLE symbols (
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        exported INTEGER NOT NULL CHECK (exported IN (0, 1))
      );

      CREATE TABLE import_relationships (
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        syntax TEXT NOT NULL CHECK (syntax IN ('import', 're_export')),
        is_type_only INTEGER NOT NULL CHECK (is_type_only IN (0, 1)),
        is_side_effect INTEGER NOT NULL CHECK (is_side_effect IN (0, 1))
      );

      CREATE TABLE callable_functions (
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        exported INTEGER NOT NULL CHECK (exported IN (0, 1))
      );

      CREATE TABLE call_relationships (
        caller_name TEXT NOT NULL,
        caller_path TEXT NOT NULL,
        caller_line INTEGER NOT NULL,
        caller_column INTEGER NOT NULL,
        caller_exported INTEGER NOT NULL CHECK (caller_exported IN (0, 1)),
        callee_name TEXT NOT NULL,
        callee_path TEXT NOT NULL,
        callee_line INTEGER NOT NULL,
        callee_column INTEGER NOT NULL,
        callee_exported INTEGER NOT NULL CHECK (callee_exported IN (0, 1)),
        call_site_line INTEGER NOT NULL,
        call_site_column INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE search_entries USING fts5(
        result_type UNINDEXED,
        path UNINDEXED,
        symbol_name UNINDEXED,
        symbol_names UNINDEXED,
        symbol_kind UNINDEXED,
        line UNINDEXED,
        column UNINDEXED,
        exported UNINDEXED,
        structural_text,
        content_text,
        tokenize = 'unicode61'
      );

      CREATE INDEX symbols_name_idx ON symbols (name);
      CREATE INDEX symbols_lookup_idx ON symbols (name, exported, path, line, column);
      CREATE INDEX import_relationships_source_idx ON import_relationships (source_path, target_path, line, column);
      CREATE INDEX import_relationships_target_idx ON import_relationships (target_path, source_path, line, column);
      CREATE INDEX callable_functions_lookup_idx ON callable_functions (name, exported, path, line, column);
      CREATE INDEX call_relationships_caller_idx
        ON call_relationships (
          caller_name,
          caller_exported,
          caller_path,
          caller_line,
          caller_column,
          callee_exported,
          callee_path,
          callee_line,
          callee_column,
          call_site_line,
          call_site_column
        );
      CREATE INDEX call_relationships_callee_idx
        ON call_relationships (
          callee_name,
          callee_exported,
          callee_path,
          callee_line,
          callee_column,
          caller_exported,
          caller_path,
          caller_line,
          caller_column,
          call_site_line,
          call_site_column
        );
    `);

    const insertIndexedFile = database.prepare(`
      INSERT INTO indexed_files (path, content_hash)
      VALUES (?, ?)
    `);
    const insertSymbol = database.prepare(`
      INSERT INTO symbols (name, kind, path, line, column, exported)
      VALUES (@name, @kind, @path, @line, @column, @exported)
    `);
    const insertImportRelationship = database.prepare(`
      INSERT INTO import_relationships (source_path, target_path, line, column, syntax, is_type_only, is_side_effect)
      VALUES (@sourcePath, @targetPath, @line, @column, @syntax, @isTypeOnly, @isSideEffect)
    `);
    const insertCallableFunction = database.prepare(`
      INSERT INTO callable_functions (name, path, line, column, exported)
      VALUES (@name, @path, @line, @column, @exported)
    `);
    const insertCallRelationship = database.prepare(`
      INSERT INTO call_relationships (
        caller_name,
        caller_path,
        caller_line,
        caller_column,
        caller_exported,
        callee_name,
        callee_path,
        callee_line,
        callee_column,
        callee_exported,
        call_site_line,
        call_site_column
      )
      VALUES (
        @callerName,
        @callerPath,
        @callerLine,
        @callerColumn,
        @callerExported,
        @calleeName,
        @calleePath,
        @calleeLine,
        @calleeColumn,
        @calleeExported,
        @callSiteLine,
        @callSiteColumn
      )
    `);
    const insertSearchEntry = database.prepare(`
      INSERT INTO search_entries (
        result_type,
        path,
        symbol_name,
        symbol_names,
        symbol_kind,
        line,
        column,
        exported,
        structural_text,
        content_text
      )
      VALUES (
        @resultType,
        @path,
        @symbolName,
        @symbolNames,
        @symbolKind,
        @line,
        @column,
        @exported,
        @structuralText,
        @contentText
      )
    `);

    const populateIndex = database.transaction(
      (
        filePaths: string[],
        fileHashes: Map<string, string>,
        fileSearchDocuments: IndexedFileSearchDocument[],
        symbolRows: IndexedSymbol[],
        importRelationshipRows: ImportRelationship[],
        callableFunctionRows: IndexedFunction[],
        callRelationshipRows: CallRelationship[],
      ) => {
        for (const filePath of filePaths) {
          insertIndexedFile.run(filePath, fileHashes.get(filePath) ?? "");
        }

        for (const document of fileSearchDocuments) {
          insertSearchEntry.run({
            resultType: "path",
            path: document.path,
            symbolName: null,
            symbolNames: document.symbolNames.join("\n"),
            symbolKind: null,
            line: null,
            column: null,
            exported: null,
            structuralText: buildPathSearchText(document.path, document.symbolNames),
            contentText: document.source,
          });
        }

        for (const row of symbolRows) {
          insertSymbol.run({
            ...row,
            exported: row.exported ? 1 : 0,
          });

          insertSearchEntry.run({
            resultType: "symbol",
            path: row.path,
            symbolName: row.name,
            symbolNames: null,
            symbolKind: row.kind,
            line: row.line,
            column: row.column,
            exported: row.exported ? 1 : 0,
            structuralText: buildSymbolSearchText(row),
            contentText: "",
          });
        }

        for (const row of importRelationshipRows) {
          insertImportRelationship.run({
            ...row,
            isTypeOnly: row.typeOnly ? 1 : 0,
            isSideEffect: row.sideEffect ? 1 : 0,
          });
        }

        for (const row of callableFunctionRows) {
          insertCallableFunction.run({
            ...row,
            exported: row.exported ? 1 : 0,
          });
        }

        for (const row of callRelationshipRows) {
          insertCallRelationship.run({
            callerName: row.caller.name,
            callerPath: row.caller.path,
            callerLine: row.caller.line,
            callerColumn: row.caller.column,
            callerExported: row.caller.exported ? 1 : 0,
            calleeName: row.callee.name,
            calleePath: row.callee.path,
            calleeLine: row.callee.line,
            calleeColumn: row.callee.column,
            calleeExported: row.callee.exported ? 1 : 0,
            callSiteLine: row.callSite.line,
            callSiteColumn: row.callSite.column,
          });
        }
      }
    );

    populateIndex(indexedFiles, indexedFileHashes, indexedFileSearchDocuments, symbols, importRelationships, callableFunctions, callRelationships);
  } finally {
    database.close();
  }
}

export function readStoredFileHashes(databasePath: string): Map<string, string> | null {
  let database: Database.Database;

  try {
    database = new Database(databasePath, { readonly: true });
  } catch {
    return null;
  }

  try {
    const hasHashColumn = database
      .prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('indexed_files') WHERE name = 'content_hash'`)
      .get() as { count: number };

    if (hasHashColumn.count === 0) {
      return null;
    }

    const rows = database.prepare(`SELECT path, content_hash FROM indexed_files`).all() as Array<{
      path: string;
      content_hash: string;
    }>;

    return new Map(rows.map((row) => [row.path, row.content_hash]));
  } finally {
    database.close();
  }
}

export function applyIncrementalUpdate(
  databasePath: string,
  staleAndRemovedPaths: ReadonlySet<string>,
  indexedFiles: string[],
  indexedFileHashes: Map<string, string>,
  indexedFileSearchDocuments: IndexedFileSearchDocument[],
  symbols: IndexedSymbol[],
  importRelationships: ImportRelationship[],
  callableFunctions: IndexedFunction[],
  callRelationships: CallRelationship[],
): void {
  const database = new Database(databasePath);

  try {
    const deleteIndexedFile = database.prepare(`DELETE FROM indexed_files WHERE path = ?`);
    const deleteSymbols = database.prepare(`DELETE FROM symbols WHERE path = ?`);
    const deleteImportRelationships = database.prepare(`DELETE FROM import_relationships WHERE source_path = ?`);
    const deleteCallableFunctions = database.prepare(`DELETE FROM callable_functions WHERE path = ?`);
    const deleteCallRelationshipsByCaller = database.prepare(`DELETE FROM call_relationships WHERE caller_path = ?`);
    const deleteCallRelationshipsByCallee = database.prepare(`DELETE FROM call_relationships WHERE callee_path = ?`);
    const deleteSearchEntries = database.prepare(`DELETE FROM search_entries WHERE path = ?`);

    const insertIndexedFile = database.prepare(`INSERT INTO indexed_files (path, content_hash) VALUES (?, ?)`);
    const insertSymbol = database.prepare(
      `INSERT INTO symbols (name, kind, path, line, column, exported) VALUES (@name, @kind, @path, @line, @column, @exported)`,
    );
    const insertImportRelationship = database.prepare(
      `INSERT INTO import_relationships (source_path, target_path, line, column, syntax, is_type_only, is_side_effect)
       VALUES (@sourcePath, @targetPath, @line, @column, @syntax, @isTypeOnly, @isSideEffect)`,
    );
    const insertCallableFunction = database.prepare(
      `INSERT INTO callable_functions (name, path, line, column, exported) VALUES (@name, @path, @line, @column, @exported)`,
    );
    const insertCallRelationship = database.prepare(
      `INSERT INTO call_relationships (
        caller_name, caller_path, caller_line, caller_column, caller_exported,
        callee_name, callee_path, callee_line, callee_column, callee_exported,
        call_site_line, call_site_column
      ) VALUES (
        @callerName, @callerPath, @callerLine, @callerColumn, @callerExported,
        @calleeName, @calleePath, @calleeLine, @calleeColumn, @calleeExported,
        @callSiteLine, @callSiteColumn
      )`,
    );
    const insertSearchEntry = database.prepare(
      `INSERT INTO search_entries (
        result_type, path, symbol_name, symbol_names, symbol_kind, line, column, exported, structural_text, content_text
      ) VALUES (
        @resultType, @path, @symbolName, @symbolNames, @symbolKind, @line, @column, @exported, @structuralText, @contentText
      )`,
    );

    const applyUpdate = database.transaction(() => {
      for (const stalePath of staleAndRemovedPaths) {
        deleteCallRelationshipsByCallee.run(stalePath);
        deleteCallRelationshipsByCaller.run(stalePath);
        deleteImportRelationships.run(stalePath);
        deleteSymbols.run(stalePath);
        deleteCallableFunctions.run(stalePath);
        deleteSearchEntries.run(stalePath);
        deleteIndexedFile.run(stalePath);
      }

      for (const filePath of indexedFiles) {
        insertIndexedFile.run(filePath, indexedFileHashes.get(filePath) ?? "");
      }

      for (const document of indexedFileSearchDocuments) {
        insertSearchEntry.run({
          resultType: "path",
          path: document.path,
          symbolName: null,
          symbolNames: document.symbolNames.join("\n"),
          symbolKind: null,
          line: null,
          column: null,
          exported: null,
          structuralText: buildPathSearchText(document.path, document.symbolNames),
          contentText: document.source,
        });
      }

      for (const row of symbols) {
        insertSymbol.run({ ...row, exported: row.exported ? 1 : 0 });
        insertSearchEntry.run({
          resultType: "symbol",
          path: row.path,
          symbolName: row.name,
          symbolNames: null,
          symbolKind: row.kind,
          line: row.line,
          column: row.column,
          exported: row.exported ? 1 : 0,
          structuralText: buildSymbolSearchText(row),
          contentText: "",
        });
      }

      for (const row of importRelationships) {
        insertImportRelationship.run({ ...row, isTypeOnly: row.typeOnly ? 1 : 0, isSideEffect: row.sideEffect ? 1 : 0 });
      }

      for (const row of callableFunctions) {
        insertCallableFunction.run({ ...row, exported: row.exported ? 1 : 0 });
      }

      for (const row of callRelationships) {
        insertCallRelationship.run({
          callerName: row.caller.name,
          callerPath: row.caller.path,
          callerLine: row.caller.line,
          callerColumn: row.caller.column,
          callerExported: row.caller.exported ? 1 : 0,
          calleeName: row.callee.name,
          calleePath: row.callee.path,
          calleeLine: row.callee.line,
          calleeColumn: row.callee.column,
          calleeExported: row.callee.exported ? 1 : 0,
          callSiteLine: row.callSite.line,
          callSiteColumn: row.callSite.column,
        });
      }
    });

    applyUpdate();
  } finally {
    database.close();
  }
}

export function readIndexCounts(databasePath: string): { fileCount: number; symbolCount: number } {
  const database = new Database(databasePath, { readonly: true });

  try {
    const { fileCount } = database.prepare(`SELECT COUNT(*) AS fileCount FROM indexed_files`).get() as {
      fileCount: number;
    };
    const { symbolCount } = database.prepare(`SELECT COUNT(*) AS symbolCount FROM symbols`).get() as {
      symbolCount: number;
    };

    return { fileCount, symbolCount };
  } finally {
    database.close();
  }
}


export function lookupSymbols(databasePath: string, name: string): IndexedSymbol[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    const selectSymbols = database.prepare(`
      SELECT name, kind, path, line, column, exported
      FROM symbols
      WHERE name = ?
      ORDER BY exported DESC, path ASC, line ASC, column ASC
    `);

    return (selectSymbols.all(name) as SymbolRow[]).map((row: SymbolRow) => mapSymbolRow(row));
  } finally {
    database.close();
  }
}

export function fetchSearchCandidates(databasePath: string, matchExpression: string, candidateLimit: number): SearchCandidate[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    const selectEntries = database.prepare(`
      SELECT
        result_type,
        path,
        symbol_name,
        symbol_names,
        symbol_kind,
        line,
        column,
        exported,
        structural_text,
        content_text,
        bm25(search_entries, 1.0, 0.5) AS relevance
      FROM search_entries
      WHERE search_entries MATCH ?
      ORDER BY relevance ASC, path ASC, line ASC, column ASC, symbol_name ASC
      LIMIT ?
    `);

    return (selectEntries.all(matchExpression, candidateLimit) as Array<{
      result_type: "path" | "symbol";
      path: string;
      symbol_name: string | null;
      symbol_names: string | null;
      symbol_kind: IndexedSymbol["kind"] | null;
      line: number | null;
      column: number | null;
      exported: number | null;
      structural_text: string;
      content_text: string;
      relevance: number;
    }>).map((row) => ({
      resultType: row.result_type,
      path: row.path,
      symbolName: row.symbol_name,
      symbolNames: row.symbol_names,
      symbolKind: row.symbol_kind,
      line: row.line,
      column: row.column,
      exported: row.exported,
      structuralText: row.structural_text,
      contentText: row.content_text,
      relevance: row.relevance,
    }));
  } finally {
    database.close();
  }
}

export function lookupSymbolsByPath(databasePath: string, repositoryPath: string): IndexedSymbol[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    assertIndexedPath(database, repositoryPath);

    const selectSymbols = database.prepare(`
      SELECT name, kind, path, line, column, exported
      FROM symbols
      WHERE path = ?
      ORDER BY line ASC, column ASC, name ASC, kind ASC
    `);

    return (selectSymbols.all(repositoryPath) as SymbolRow[]).map((row: SymbolRow) => mapSymbolRow(row));
  } finally {
    database.close();
  }
}

export function lookupImportRelationshipsBySourcePath(databasePath: string, repositoryPath: string): ImportRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    assertIndexedPath(database, repositoryPath);

    const selectRelationships = database.prepare(`
      SELECT source_path, target_path, line, column, syntax, is_type_only, is_side_effect
      FROM import_relationships
      WHERE source_path = ?
      ORDER BY target_path ASC, line ASC, column ASC, syntax ASC, is_type_only ASC, is_side_effect ASC
    `);

    return (selectRelationships.all(repositoryPath) as ImportRelationshipRow[]).map((row: ImportRelationshipRow) =>
      mapImportRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

export function lookupImportRelationshipsByTargetPath(databasePath: string, repositoryPath: string): ImportRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    assertIndexedPath(database, repositoryPath);

    const selectRelationships = database.prepare(`
      SELECT source_path, target_path, line, column, syntax, is_type_only, is_side_effect
      FROM import_relationships
      WHERE target_path = ?
      ORDER BY source_path ASC, line ASC, column ASC, syntax ASC, is_type_only ASC, is_side_effect ASC
    `);

    return (selectRelationships.all(repositoryPath) as ImportRelationshipRow[]).map((row: ImportRelationshipRow) =>
      mapImportRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

export function lookupCallableFunctions(databasePath: string, name: string): IndexedFunction[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    const selectFunctions = database.prepare(`
      SELECT name, path, line, column, exported
      FROM callable_functions
      WHERE name = ?
      ORDER BY exported DESC, path ASC, line ASC, column ASC
    `);

    return (selectFunctions.all(name) as CallableFunctionRow[]).map((row: CallableFunctionRow) => mapCallableFunctionRow(row));
  } finally {
    database.close();
  }
}

export function lookupCallRelationshipsByCallerName(databasePath: string, functionName: string): CallRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    const selectRelationships = database.prepare(`
      SELECT
        caller_name,
        caller_path,
        caller_line,
        caller_column,
        caller_exported,
        callee_name,
        callee_path,
        callee_line,
        callee_column,
        callee_exported,
        call_site_line,
        call_site_column
      FROM call_relationships
      WHERE caller_name = ?
      ORDER BY
        caller_exported DESC,
        caller_path ASC,
        caller_line ASC,
        caller_column ASC,
        callee_exported DESC,
        callee_path ASC,
        callee_line ASC,
        callee_column ASC,
        call_site_line ASC,
        call_site_column ASC
    `);

    return (selectRelationships.all(functionName) as CallRelationshipRow[]).map((row: CallRelationshipRow) =>
      mapCallRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

export function lookupCallRelationshipsByCallerPath(databasePath: string, repositoryPath: string): CallRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    assertIndexedPath(database, repositoryPath);

    const selectRelationships = database.prepare(`
      SELECT
        caller_name,
        caller_path,
        caller_line,
        caller_column,
        caller_exported,
        callee_name,
        callee_path,
        callee_line,
        callee_column,
        callee_exported,
        call_site_line,
        call_site_column
      FROM call_relationships
      WHERE caller_path = ?
      ORDER BY
        caller_line ASC,
        caller_column ASC,
        callee_path ASC,
        callee_line ASC,
        callee_column ASC,
        call_site_line ASC,
        call_site_column ASC
    `);

    return (selectRelationships.all(repositoryPath) as CallRelationshipRow[]).map((row: CallRelationshipRow) =>
      mapCallRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

export function lookupCallRelationshipsByCalleeName(databasePath: string, functionName: string): CallRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    const selectRelationships = database.prepare(`
      SELECT
        caller_name,
        caller_path,
        caller_line,
        caller_column,
        caller_exported,
        callee_name,
        callee_path,
        callee_line,
        callee_column,
        callee_exported,
        call_site_line,
        call_site_column
      FROM call_relationships
      WHERE callee_name = ?
      ORDER BY
        callee_exported DESC,
        callee_path ASC,
        callee_line ASC,
        callee_column ASC,
        caller_exported DESC,
        caller_path ASC,
        caller_line ASC,
        caller_column ASC,
        call_site_line ASC,
        call_site_column ASC
    `);

    return (selectRelationships.all(functionName) as CallRelationshipRow[]).map((row: CallRelationshipRow) =>
      mapCallRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

export function lookupCallRelationshipsByCalleePath(databasePath: string, repositoryPath: string): CallRelationship[] {
  const database = new Database(databasePath, { readonly: true });

  try {
    assertIndexedPath(database, repositoryPath);

    const selectRelationships = database.prepare(`
      SELECT
        caller_name,
        caller_path,
        caller_line,
        caller_column,
        caller_exported,
        callee_name,
        callee_path,
        callee_line,
        callee_column,
        callee_exported,
        call_site_line,
        call_site_column
      FROM call_relationships
      WHERE callee_path = ?
      ORDER BY
        caller_path ASC,
        caller_line ASC,
        caller_column ASC,
        callee_line ASC,
        callee_column ASC,
        call_site_line ASC,
        call_site_column ASC
    `);

    return (selectRelationships.all(repositoryPath) as CallRelationshipRow[]).map((row: CallRelationshipRow) =>
      mapCallRelationshipRow(row),
    );
  } finally {
    database.close();
  }
}

function mapSymbolRow(row: SymbolRow): IndexedSymbol {
  return {
    name: row.name,
    kind: row.kind,
    path: row.path,
    line: row.line,
    column: row.column,
    exported: Boolean(row.exported),
  };
}

function mapImportRelationshipRow(row: ImportRelationshipRow): ImportRelationship {
  return {
    sourcePath: row.source_path,
    targetPath: row.target_path,
    line: row.line,
    column: row.column,
    syntax: row.syntax,
    typeOnly: Boolean(row.is_type_only),
    sideEffect: Boolean(row.is_side_effect),
  };
}

function mapCallableFunctionRow(row: CallableFunctionRow): IndexedFunction {
  return {
    name: row.name,
    kind: "function",
    path: row.path,
    line: row.line,
    column: row.column,
    exported: Boolean(row.exported),
  };
}

function mapCallRelationshipRow(row: CallRelationshipRow): CallRelationship {
  return {
    caller: {
      name: row.caller_name,
      kind: "function",
      path: row.caller_path,
      line: row.caller_line,
      column: row.caller_column,
      exported: Boolean(row.caller_exported),
    },
    callee: {
      name: row.callee_name,
      kind: "function",
      path: row.callee_path,
      line: row.callee_line,
      column: row.callee_column,
      exported: Boolean(row.callee_exported),
    },
    callSite: {
      line: row.call_site_line,
      column: row.call_site_column,
    },
  };
}

function assertIndexedPath(database: Database.Database, repositoryPath: string): void {
  const selectIndexedPath = database.prepare(`
    SELECT 1
    FROM indexed_files
    WHERE path = ?
    LIMIT 1
  `);

  if (!selectIndexedPath.get(repositoryPath)) {
    throw new PetrichorError("path_not_indexed", `No indexed Repository Path found for \`${repositoryPath}\`.`);
  }
}

function buildPathSearchText(repositoryPath: string, symbolNames: readonly string[]): string {
  return [repositoryPath, ...symbolNames].flatMap((value) => expandSearchTerms(value)).join(" ");
}

function buildSymbolSearchText(symbol: IndexedSymbol): string {
  const parts = [symbol.name, symbol.kind, symbol.path];
  if (symbol.exported) {
    parts.push("exported");
  }

  return parts.flatMap((value) => expandSearchTerms(value)).join(" ");
}

function expandSearchTerms(value: string): string[] {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return [];
  }

  return [normalizedValue, tokenizeSearchTerms(normalizedValue).join(" ")];
}

export function tokenizeSearchTerms(value: string): string[] {
  const separatedValue = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  return Array.from(new Set((separatedValue.match(/[a-zA-Z0-9]+/g) ?? []).map((token) => token.toLowerCase())));
}
