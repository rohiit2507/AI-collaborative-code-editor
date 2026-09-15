CREATE TABLE IF NOT EXISTS file_versions (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  filename VARCHAR(255) NOT NULL,
  language VARCHAR(64) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_id, version_number)
);

CREATE INDEX IF NOT EXISTS file_versions_file_created_idx
  ON file_versions (file_id, created_at DESC);
