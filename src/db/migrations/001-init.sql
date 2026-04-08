-- nodes: code graph vertices (symbols and files)
CREATE TABLE IF NOT EXISTS nodes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL CHECK(type IN ('symbol', 'file')),
  name       TEXT    NOT NULL,
  file_path  TEXT    NOT NULL,
  line       INTEGER,
  column     INTEGER,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_unique
  ON nodes(type, name, file_path);

CREATE INDEX IF NOT EXISTS idx_nodes_file
  ON nodes(file_path);

CREATE INDEX IF NOT EXISTS idx_nodes_type
  ON nodes(type);

-- edges: relationships between nodes
CREATE TABLE IF NOT EXISTS edges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL CHECK(kind IN ('defines', 'imports', 'calls', 'references')),
  source_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id  INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  file_path  TEXT    NOT NULL,
  line       INTEGER,
  column     INTEGER,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_edges_source
  ON edges(source_id);

CREATE INDEX IF NOT EXISTS idx_edges_target
  ON edges(target_id);

CREATE INDEX IF NOT EXISTS idx_edges_kind
  ON edges(kind);

CREATE INDEX IF NOT EXISTS idx_edges_file
  ON edges(file_path);
