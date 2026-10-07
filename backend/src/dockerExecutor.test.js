const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { LIMITS, RUNNERS, executeInDocker } = require("./dockerExecutor");

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

test("executeInDocker enables stdin and pipes it unchanged outside command arguments", async () => {
  const input = "10\n20\n";
  let receivedInput = "";
  let executionArgs;

  const result = await executeInDocker({
    language: "python",
    code: "first = input()\nsecond = input()\nprint(first, second)",
    stdin: input,
    limits: { ...LIMITS, timeoutMs: 1000 },
    spawnProcess: (command, commandArgs) => {
      assert.equal(command, "docker");
      if (commandArgs[0] === "image") {
        const inspect = new EventEmitter();
        process.nextTick(() => inspect.emit("close", 0, null));
        return inspect;
      }

      executionArgs = commandArgs;
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin.on("data", (chunk) => {
      receivedInput += chunk.toString("utf8");
    });
    child.stdin.on("end", () => {
      child.emit("close", 0, null);
    });
    return child;
    },
  });

  assert.equal(receivedInput, input);
  assert.equal(result.status, "success");
  assert.ok(executionArgs.includes("--interactive"));
  assert.ok(!executionArgs.includes(input));
});
