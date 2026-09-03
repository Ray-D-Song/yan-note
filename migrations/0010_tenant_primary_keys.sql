-- Fix multi-tenant primary keys: scope mutation and purge records by user_id.

CREATE TABLE applied_mutations_v2 (
  user_id     TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  result      TEXT NOT NULL,
  response    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);

INSERT INTO applied_mutations_v2 (
  user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at
)
SELECT user_id, mutation_id, device_id, entity_type, entity_id, result, response, created_at
FROM applied_mutations;

DROP TABLE applied_mutations;
ALTER TABLE applied_mutations_v2 RENAME TO applied_mutations;

CREATE INDEX idx_applied_mutations_user ON applied_mutations(user_id, created_at);

CREATE TABLE purged_entities_v2 (
  user_id     TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  purged_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, entity_type, entity_id)
);

INSERT INTO purged_entities_v2 (user_id, entity_type, entity_id, purged_at)
SELECT user_id, entity_type, entity_id, purged_at
FROM purged_entities;

DROP TABLE purged_entities;
ALTER TABLE purged_entities_v2 RENAME TO purged_entities;

CREATE INDEX idx_purged_entities_user ON purged_entities(user_id);
