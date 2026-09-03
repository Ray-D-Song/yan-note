ALTER TABLE notes ADD COLUMN deleted_at INTEGER;

CREATE INDEX idx_notes_user_deleted ON notes(user_id, deleted_at);
