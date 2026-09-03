-- Tie CAS updates to a specific mutation id so follow-up change/idempotency rows
-- only insert when THIS mutation won the revision race.

ALTER TABLE notes ADD COLUMN last_mutation_id TEXT;
ALTER TABLE databases ADD COLUMN last_mutation_id TEXT;
ALTER TABLE database_cells ADD COLUMN last_mutation_id TEXT;
