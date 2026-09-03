UPDATE notes
SET sort_order = (
  SELECT rn
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, COALESCE(parent_id, '')
        ORDER BY created_at ASC
      ) - 1 AS rn
    FROM notes
  ) AS ranked
  WHERE ranked.id = notes.id
);
