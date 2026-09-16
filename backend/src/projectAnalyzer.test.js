const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeProject, searchProject } = require("./projectAnalyzer");

test("project analyzer extracts symbols, imports, and file metadata", () => {
  const [metadata] = analyzeProject([
    { filename: "auth.py", content: "from db import users\n\ndef login():\n    pass\n", language: "python" },
  ]);

  assert.equal(metadata.filename, "auth.py");
  assert.equal(metadata.lines, 5);
  assert.deepEqual(metadata.symbols, ["login"]);
  assert.deepEqual(metadata.imports, ["db"]);
});

test("project search ranks files containing relevant symbols", () => {
  const results = searchProject("where is login implemented", [
    { filename: "auth.py", language: "python", content: "def login():\n    pass" },
    { filename: "main.py", language: "python", content: "print('home')" },
  ]);

  assert.equal(results[0].filename, "auth.py");
  assert.ok(results[0].symbols.includes("login"));
});