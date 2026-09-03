-- Serialize note tree mutations per user to prevent cross-node move races.

ALTER TABLE users ADD COLUMN note_tree_lock INTEGER NOT NULL DEFAULT 0;
