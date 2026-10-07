const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("./config/db");
const authorizeRoomOwner = require("./middleware/roomAuthorization");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("room owner authorization rejects a non-owner before room deletion", async (context) => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{ id: 17, owner_id: 3, is_member: true }],
  });
  context.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  let nextCalled = false;

  await authorizeRoomOwner(
    { params: { roomId: "17" }, user: { userId: 8 } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, "You are not authorized to access this room");
  assert.equal(nextCalled, false);
});

test("room owner authorization allows the owner", async (context) => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rows: [{ id: 17, owner_id: 3, is_member: false }],
  });
  context.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  let nextCalled = false;

  await authorizeRoomOwner(
    { params: { roomId: "17" }, user: { userId: 3 } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(nextCalled, true);
});