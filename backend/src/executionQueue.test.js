const test = require("node:test");
const assert = require("node:assert/strict");
const ExecutionQueue = require("./executionQueue");

test("runs queued jobs one at a time", async () => {
  let activeJobs = 0;
  let maximumActiveJobs = 0;

  const queue = new ExecutionQueue({
    maxPending: 2,
    worker: async (job) => {
      activeJobs += 1;
      maximumActiveJobs = Math.max(maximumActiveJobs, activeJobs);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeJobs -= 1;
      return job;
    },
  });

  const results = await Promise.all([
    queue.enqueue("first"),
    queue.enqueue("second"),
    queue.enqueue("third"),
  ]);

  assert.deepEqual(results, ["first", "second", "third"]);
  assert.equal(maximumActiveJobs, 1);
});

test("rejects jobs when the pending queue is full", async () => {
  let releaseFirstJob;
  let workerCallCount = 0;
  const queue = new ExecutionQueue({
    maxPending: 1,
    worker: () =>
      new Promise((resolve) => {
        workerCallCount += 1;
        if (workerCallCount === 1) {
          releaseFirstJob = resolve;
          return;
        }
        resolve("second");
      }),
  });

  const firstJob = queue.enqueue("first");
  const secondJob = queue.enqueue("second");
  await assert.rejects(queue.enqueue("third"), { code: "QUEUE_FULL" });
  releaseFirstJob("first");
  await assert.doesNotReject(firstJob);
  await assert.doesNotReject(secondJob);
});
