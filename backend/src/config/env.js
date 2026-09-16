require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === "change_this_to_a_long_random_secret") {
  if (isProduction) {
    throw new Error("JWT_SECRET must be a strong secret with at least 32 characters");
  }

  console.warn("JWT_SECRET is weak or missing; use a strong secret outside local development.");
}

const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

const corsOrigins = (process.env.CORS_ORIGIN || defaultCorsOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  backendUrl: process.env.BACKEND_URL || "http://localhost:5000",
  corsOrigins,
  databaseUrl: process.env.DATABASE_URL,
  host: process.env.HOST || "0.0.0.0",
  isProduction,
  jwtSecret,
  port: Number(process.env.PORT || 5000),
};
