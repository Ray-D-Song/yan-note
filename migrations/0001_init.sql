CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES notes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT '无标题',
  content    TEXT NOT NULL DEFAULT '',
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_notes_user_parent ON notes(user_id, parent_id);
CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC);
