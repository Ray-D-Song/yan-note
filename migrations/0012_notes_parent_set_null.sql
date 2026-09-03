-- Rebuild notes with ON DELETE SET NULL for parent_id.
-- D1 always enforces FKs in transactions; snapshot cross-table links before DROP TABLE notes.

CREATE TABLE _migration_database_note_links (
  database_id TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL
);

INSERT INTO _migration_database_note_links (database_id, note_id)
SELECT id, note_id FROM databases WHERE note_id IS NOT NULL;

CREATE TABLE _migration_note_parent_links (
  note_id   TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL
);

INSERT INTO _migration_note_parent_links (note_id, parent_id)
SELECT id, parent_id FROM notes WHERE parent_id IS NOT NULL;

CREATE TABLE notes_new (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id        TEXT REFERENCES notes(id) ON DELETE SET NULL,
  title            TEXT NOT NULL DEFAULT '无标题',
  content          TEXT NOT NULL DEFAULT '',
  icon             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER,
  revision         INTEGER NOT NULL DEFAULT 1,
  position_key     TEXT NOT NULL DEFAULT 'a0',
  title_clock      TEXT,
  content_clock    TEXT,
  icon_clock       TEXT,
  parent_clock     TEXT,
  position_clock   TEXT,
  purged_at        INTEGER,
  last_mutation_id TEXT
);

INSERT INTO notes_new (
  id, user_id, parent_id, title, content, icon, sort_order, created_at, updated_at,
  deleted_at, revision, position_key, title_clock, content_clock, icon_clock,
  parent_clock, position_clock, purged_at, last_mutation_id
)
SELECT
  id, user_id, parent_id, title, content, icon, sort_order, created_at, updated_at,
  deleted_at, revision, position_key, title_clock, content_clock, icon_clock,
  parent_clock, position_clock, purged_at, last_mutation_id
FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

UPDATE notes
SET parent_id = (
  SELECT parent_id FROM _migration_note_parent_links WHERE note_id = notes.id
)
WHERE id IN (SELECT note_id FROM _migration_note_parent_links);

UPDATE databases
SET note_id = (
  SELECT note_id FROM _migration_database_note_links WHERE database_id = databases.id
)
WHERE id IN (SELECT database_id FROM _migration_database_note_links);

DROP TABLE _migration_note_parent_links;
DROP TABLE _migration_database_note_links;

CREATE INDEX IF NOT EXISTS idx_notes_user_parent ON notes(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_user_deleted ON notes(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_user_position ON notes(user_id, parent_id, position_key);

-- Observability only: D1 does not fail migrations when this returns rows.
PRAGMA foreign_key_check;
