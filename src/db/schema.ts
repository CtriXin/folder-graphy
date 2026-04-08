export interface DefinitionRow {
  id: number;
  symbol: string;
  kind: string;
  file_path: string;
  line: number;
  column: number;
  text: string;
  language: string;
}

export function initSchema(db: import("better-sqlite3").Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS definitions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol    TEXT NOT NULL,
      kind      TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line      INTEGER NOT NULL,
      column    INTEGER NOT NULL,
      text      TEXT NOT NULL,
      language  TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_definitions_unique
      ON definitions(symbol, file_path, line, kind);

    CREATE INDEX IF NOT EXISTS idx_definitions_symbol
      ON definitions(symbol);

    CREATE INDEX IF NOT EXISTS idx_definitions_file
      ON definitions(file_path);
  `);
}
