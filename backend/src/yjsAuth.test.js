const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { createYjsToken, verifyYjsToken } = require("./yjsAuth");

const secret = "yjs-test-secret-that-is-long-enough-123";

test("Yjs token contains the authenticated user and purpose", () => {
  const token = createYjsToken({ userId: 42, username: "owner" }, secret);
  const payload = verifyYjsToken(token, secret);

  assert.equal(payload.userId, 42);
  assert.equal(payload.purpose, "yjs");
  assert.equal(payload.aud, "yjs");
});

test("expired Yjs token is rejected", () => {
  const token = jwt.sign(
    { userId: 42, purpose: "yjs" },
    secret,
    { audience: "yjs", expiresIn: -1 }
  );

  assert.throws(() => verifyYjsToken(token, secret), /expired/i);
});

test("invalid and wrong-purpose tokens are rejected", () => {
  assert.throws(() => verifyYjsToken("not-a-token", secret));

  const token = jwt.sign(
    { userId: 42, purpose: "api" },
    secret,
    { audience: "api", expiresIn: "2m" }
  );

  assert.throws(() => verifyYjsToken(token, secret), /audience|purpose/i);
});

test("Yjs room authorization allows owners and members only", async () => {
  const { authorizeYjsRoom } = require("./yjsAuth");
  const pool = {
    query: async (_sql, [_roomId, userId]) => ({
      rows: userId === 7
        ? [{ owner_id: 7, is_member: false }]
        : userId === 8
          ? [{ owner_id: 7, is_member: true }]
          : [{ owner_id: 7, is_member: false }],
    }),
  };

  assert.equal(await authorizeYjsRoom(pool, 4, 7), true);
  assert.equal(await authorizeYjsRoom(pool, 4, 8), true);
  assert.equal(await authorizeYjsRoom(pool, 4, 9), false);
});
