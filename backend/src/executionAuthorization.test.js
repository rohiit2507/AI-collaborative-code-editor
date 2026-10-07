const test = require("node:test");
const assert = require("node:assert/strict");
const { canExecuteInRoom, isExecutionFileInRoom } = require("./executionAuthorization");

test("execution is allowed only to a room owner or member", () => {
  assert.equal(canExecuteInRoom({ owner_id: 4, is_member: false }, 4), true);
  assert.equal(canExecuteInRoom({ owner_id: 4, is_member: true }, 9), true);
  assert.equal(canExecuteInRoom({ owner_id: 4, is_member: false }, 9), false);
  assert.equal(canExecuteInRoom(null, 4), false);
});

test("execution file must belong to the authorized room", () => {
  assert.equal(isExecutionFileInRoom({ id: 22, room_id: 7 }, 7), true);
  assert.equal(isExecutionFileInRoom({ id: 22, room_id: 7 }, 8), false);
  assert.equal(isExecutionFileInRoom(null, 7), false);
});