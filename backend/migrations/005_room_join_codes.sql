ALTER TABLE rooms ADD COLUMN IF NOT EXISTS join_code VARCHAR(12);

UPDATE rooms
SET join_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8))
WHERE join_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rooms_join_code_idx
  ON rooms (join_code);

ALTER TABLE rooms
  ALTER COLUMN join_code SET NOT NULL;
