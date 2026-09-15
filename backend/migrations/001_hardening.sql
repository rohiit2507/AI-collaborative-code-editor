-- Part 10 database hardening indexes.
-- Run migrations in order during deployment.

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (LOWER(email));

CREATE INDEX IF NOT EXISTS rooms_owner_id_idx
  ON rooms (owner_id);

CREATE INDEX IF NOT EXISTS files_room_id_idx
  ON files (room_id);

CREATE INDEX IF NOT EXISTS room_messages_room_created_idx
  ON room_messages (room_id, created_at);
