import Database from "better-sqlite3";

import { ImportRelationship, IndexedSymbol } from "../contracts";
import { PetrichorError } from "./errors";

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

export function writeIndexDatabase(
  databasePath: string,
  indexedFiles: string[],
  symbols: IndexedSymbol[],
  importRelationships: ImportRelationship[],
): void {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE indexed_files (
        path TEXT NOT NULL PRIMARY KEY
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

      CREATE INDEX symbols_name_idx ON symbols (name);
      CREATE INDEX symbols_lookup_idx ON symbols (name, exported, path, line, column);
      CREATE INDEX import_relationships_source_idx ON import_relationships (source_path, target_path, line, column);
      CREATE INDEX import_relationships_target_idx ON import_relationships (target_path, source_path, line, column);
    `);

    const insertIndexedFile = database.prepare(`
      INSERT INTO indexed_files (path)
      VALUES (?)
    `);
    const insertSymbol = database.prepare(`
      INSERT INTO symbols (name, kind, path, line, column, exported)
      VALUES (@name, @kind, @path, @line, @column, @exported)
    `);
    const insertImportRelationship = database.prepare(`
      INSERT INTO import_relationships (source_path, target_path, line, column, syntax, is_type_only, is_side_effect)
      VALUES (@sourcePath, @targetPath, @line, @column, @syntax, @isTypeOnly, @isSideEffect)
    `);

    const populateIndex = database.transaction(
      (filePaths: string[], symbolRows: IndexedSymbol[], relationshipRows: ImportRelationship[]) => {
        for (const filePath of filePaths) {
          insertIndexedFile.run(filePath);
        }

        for (const row of symbolRows) {
          insertSymbol.run({
            ...row,
            exported: row.exported ? 1 : 0,
          });
        }

        for (const row of relationshipRows) {
          insertImportRelationship.run({
            ...row,
            isTypeOnly: row.typeOnly ? 1 : 0,
            isSideEffect: row.sideEffect ? 1 : 0,
          });
        }
      }
    );

    populateIndex(indexedFiles, symbols, importRelationships);
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
