-- Fix position_key values produced by 0005 migration (a00000000 is invalid for fractional-indexing).
-- Valid keys use 'a' || sort_order, e.g. a0, a1, a10.

UPDATE notes
SET position_key = 'a' || sort_order
WHERE position_key GLOB 'a[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';
