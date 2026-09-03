-- Sync schema: revision, field clocks, position_key, change log, versions, tombstones

ALTER TABLE notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notes ADD COLUMN position_key TEXT NOT NULL DEFAULT 'a0';
ALTER TABLE notes ADD COLUMN title_clock TEXT;
ALTER TABLE notes ADD COLUMN content_clock TEXT;
ALTER TABLE notes ADD COLUMN icon_clock TEXT;
ALTER TABLE notes ADD COLUMN parent_clock TEXT;
ALTER TABLE notes ADD COLUMN position_clock TEXT;
ALTER TABLE notes ADD COLUMN purged_at INTEGER;

-- Deterministic position_key from existing sort_order (valid fractional-indexing keys)
UPDATE notes SET position_key = 'a' || sort_order;

-- Backfill field clocks from updated_at (revision stays at 1)
UPDATE notes SET
  title_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration'),
  content_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration'),
  icon_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration'),
  parent_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration'),
  position_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration')
WHERE title_clock IS NULL;

CREATE INDEX idx_notes_user_position ON notes(user_id, parent_id, position_key);

CREATE TABLE sync_changes (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  revision    INTEGER NOT NULL,
  operation   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_sync_changes_user_seq ON sync_changes(user_id, seq);

CREATE TABLE applied_mutations (
  mutation_id TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  result      TEXT NOT NULL,
  response    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_applied_mutations_user ON applied_mutations(user_id, created_at);

CREATE TABLE note_versions (
  id         TEXT PRIMARY KEY,
  note_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  snapshot   TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  field_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_note_versions_note ON note_versions(note_id, created_at DESC);

CREATE TABLE purged_entities (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  purged_at   INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX idx_purged_entities_user ON purged_entities(user_id);
