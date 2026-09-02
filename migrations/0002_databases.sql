CREATE TABLE databases (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
  title      TEXT NOT NULL DEFAULT 'Untitled',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE database_properties (
  id          TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'text',
  config      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE database_rows (
  id          TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE database_cells (
  row_id      TEXT NOT NULL REFERENCES database_rows(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES database_properties(id) ON DELETE CASCADE,
  value       TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (row_id, property_id)
);

CREATE INDEX idx_databases_user ON databases(user_id, updated_at DESC);
CREATE INDEX idx_database_properties_db ON database_properties(database_id, sort_order);
CREATE INDEX idx_database_rows_db ON database_rows(database_id, sort_order);
