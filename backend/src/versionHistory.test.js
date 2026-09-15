const test = require("node:test");
const assert = require("node:assert/strict");

const { createVersionSnapshot, buildVersionLabel } = require("./versionHistory");

test("version snapshots preserve the latest file state", () => {
  const snapshot = createVersionSnapshot({
    id: 7,
    filename: "main.py",
    language: "python",
    content: "print('hello')\n",
    versionNumber: 2,
  });

  assert.deepEqual(snapshot, {
    id: 7,
    versionNumber: 2,
    filename: "main.py",
    language: "python",
    content: "print('hello')\n",
    summary: "Saved main.py",
  });
});

test("version labels stay consistent for UI display", () => {
  assert.equal(buildVersionLabel({ versionNumber: 3 }), "Version 3");
  assert.equal(buildVersionLabel({ version_number: 7 }), "Version 7");
});
