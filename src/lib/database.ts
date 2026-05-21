import Database from "better-sqlite3";

import { IndexedSymbol } from "../contracts";

interface SymbolRow {
  column: number;
  exported: number;
  kind: IndexedSymbol["kind"];
  line: number;
  name: string;
  path: string;
}

export function writeIndexDatabase(databasePath: string, symbols: IndexedSymbol[]): void {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE symbols (
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        exported INTEGER NOT NULL CHECK (exported IN (0, 1))
      );

      CREATE INDEX symbols_name_idx ON symbols (name);
      CREATE INDEX symbols_lookup_idx ON symbols (name, exported, path, line, column);
    `);

    const insertSymbol = database.prepare(`
      INSERT INTO symbols (name, kind, path, line, column, exported)
      VALUES (@name, @kind, @path, @line, @column, @exported)
    `);

    const insertSymbols = database.transaction((rows: IndexedSymbol[]) => {
      for (const row of rows) {
        insertSymbol.run({
          ...row,
          exported: row.exported ? 1 : 0,
        });
      }
    });

    insertSymbols(symbols);
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
