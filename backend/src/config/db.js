const { Pool } = require("pg");
const { databaseUrl, isProduction } = require("./env");
const useSsl = process.env.DB_SSL === "true" || (isProduction && process.env.DB_SSL !== "false");

const pool = new Pool({
  ...(databaseUrl
    ? { connectionString: databaseUrl }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }),
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: useSsl ? { rejectUnauthorized: true } : undefined,
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error:", error.message);
});

module.exports = pool;