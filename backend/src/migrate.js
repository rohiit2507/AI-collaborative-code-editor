const fs = require("node:fs/promises");
const path = require("node:path");
const pool = require("./config/db");

async function migrate() {
  const migrationDirectory = path.join(__dirname, "..", "migrations");
  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const filename of files) {
    const applied = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    if (applied.rowCount > 0) continue;

    const sql = await fs.readFile(path.join(migrationDirectory, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error.message);
    await pool.end();
    process.exitCode = 1;
  });
