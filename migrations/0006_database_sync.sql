-- Database sync: revision and field clocks

ALTER TABLE databases ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE databases ADD COLUMN title_clock TEXT;

ALTER TABLE database_rows ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE database_cells ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE database_cells ADD COLUMN value_clock TEXT;

UPDATE databases SET
  title_clock = json_object('adjusted_ms', updated_at, 'counter', 0, 'device_id', 'migration')
WHERE title_clock IS NULL;

UPDATE database_cells SET
  value_clock = json_object('adjusted_ms', (SELECT updated_at FROM database_rows r WHERE r.id = database_cells.row_id), 'counter', 0, 'device_id', 'migration')
WHERE value_clock IS NULL;
