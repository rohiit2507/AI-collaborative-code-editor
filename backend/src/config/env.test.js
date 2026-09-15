const test = require("node:test");
const assert = require("node:assert/strict");

const envModulePath = require.resolve("./env");

delete require.cache[envModulePath];
delete process.env.CORS_ORIGIN;

const { corsOrigins } = require("./env");

test("default CORS config includes the common local frontend ports", () => {
  assert.deepEqual(corsOrigins, [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ]);
});
