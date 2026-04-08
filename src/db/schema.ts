export type NodeType = "symbol" | "file";

export type EdgeKind = "defines" | "imports" | "calls" | "references";

export interface NodeRow {
  id: number;
  type: NodeType;
  name: string;
  file_path: string;
  line: number | null;
  column: number | null;
  detail: string | null;
  created_at: string;
}

export interface EdgeRow {
  id: number;
  kind: EdgeKind;
  source_id: number;
  target_id: number;
  file_path: string;
  line: number | null;
  column: number | null;
  created_at: string;
}

export function initSchema(db: import("better-sqlite3").Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT    NOT NULL CHECK(type IN ('symbol', 'file')),
      name      TEXT    NOT NULL,
      file_path TEXT    NOT NULL,
      line      INTEGER,
      column    INTEGER,
      detail    TEXT,
      created_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_unique
      ON nodes(type, name, file_path);

    CREATE INDEX IF NOT EXISTS idx_nodes_file
      ON nodes(file_path);

    CREATE INDEX IF NOT EXISTS idx_nodes_type
      ON nodes(type);

    CREATE TABLE IF NOT EXISTS edges (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      kind      TEXT    NOT NULL CHECK(kind IN ('defines', 'imports', 'calls', 'references')),
      source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      file_path TEXT    NOT NULL,
      line      INTEGER,
      column    INTEGER,
      created_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source
      ON edges(source_id);

    CREATE INDEX IF NOT EXISTS idx_edges_target
      ON edges(target_id);

    CREATE INDEX IF NOT EXISTS idx_edges_kind
      ON edges(kind);

    CREATE INDEX IF NOT EXISTS idx_edges_file
      ON edges(file_path);
  `);
}
