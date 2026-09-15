const test = require("node:test");
const assert = require("node:assert/strict");
const { LIMITS, RUNNERS } = require("./dockerExecutor");

test("supported runners have isolated source and command definitions", () => {
  for (const language of ["python", "javascript", "cpp", "java"]) {
    assert.ok(RUNNERS[language]);
    assert.match(RUNNERS[language].sourceName, /^[A-Za-z0-9_.-]+$/);
    assert.ok(Array.isArray(RUNNERS[language].command));
    assert.ok(RUNNERS[language].image.includes(":"));
  }
});

test("execution limits stay bounded", () => {
  assert.equal(LIMITS.timeoutMs, 5000);
  assert.equal(LIMITS.memory, "128m");
  assert.equal(LIMITS.cpus, "0.5");
  assert.equal(LIMITS.pids, "64");
  assert.ok(LIMITS.outputBytes <= 64 * 1024);
});
