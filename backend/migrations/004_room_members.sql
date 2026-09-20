CREATE TABLE IF NOT EXISTS room_members (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_room_id_idx
  ON room_members (room_id);

CREATE INDEX IF NOT EXISTS room_members_user_id_idx
  ON room_members (user_id);