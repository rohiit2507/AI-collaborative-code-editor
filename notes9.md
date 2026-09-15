# Part 9 - Secure Code Execution Interview Notes

## 1. Why should user code not run directly in Node.js?

Arbitrary code can read files, consume resources, access secrets, create processes, or interfere with the backend. The API process should only validate and enqueue work; isolated workers should execute it.

## 2. What is the execution flow?

The editor sends code to the execution API. The API authenticates and validates the request, creates a job, and places it in a queue. A worker takes the job, runs it inside a disposable sandbox, captures stdout and stderr, destroys the sandbox, and returns a normalized result.

## 3. Why do we need a queue?

A queue provides backpressure and prevents unlimited simultaneous executions. It also creates a clean boundary for retries, cancellation, priorities, and future Redis-backed scaling.

## 4. What should the execution API do?

It should authenticate the user, validate the room/file access, validate the language and code size, create a job, and return a job id or structured result. It should never execute source code in the HTTP process.

## 5. Which result states do we need?

The stable result states are `success`, `runtime_error`, `compilation_error`, `timeout`, `resource_limit`, and `system_error`. Standard output and standard error should remain separate for clear UI rendering.

## 6. What limits belong in the sandbox?

The sandbox needs wall-clock timeout, CPU limit, memory limit, process limit, output limit, network restriction, temporary filesystem access, and guaranteed cleanup.

## 7. Why should every execution use a disposable container?

A fresh container reduces cross-job contamination and makes cleanup predictable. The worker can destroy the container after success, failure, timeout, or cancellation.

## 8. What secrets must never enter the sandbox?

JWT secrets, database credentials, cookies, host filesystem mounts, Docker socket access, and unrestricted environment variables must never be exposed to submitted code.

## 9. Why start with Python?

Python has a simple run command and does not require a separate compilation stage. Once the contract is stable, JavaScript and compiled languages can implement the same runner interface.

## 10. What is implemented in Part 9?

The backend now authenticates execution requests, verifies room and file access, validates language and code size, places jobs in a bounded single-worker queue, and executes only through a Docker worker. The frontend renders structured status, output, errors, duration, timeout, and infrastructure failures.

## 11. What happens when Docker is unavailable?

The executor fails closed and returns a `system_error` response telling the user to start Docker. It never falls back to running code directly on the Node.js host.

## 12. What remains to verify in a Docker-enabled environment?

The runtime security suite must exercise infinite loops, large output, filesystem access, network access, process spawning, container cleanup, and all supported language runners. Docker Desktop is unavailable in the current development environment, so those tests remain pending.

## Strong interview answer

"For secure execution, the browser should never cause arbitrary source code to run inside the Node.js API process. The API authenticates and validates the request, creates a bounded execution job, and sends it to a worker. The worker runs one job inside a disposable sandbox with CPU, memory, process, output, timeout, network, and filesystem restrictions. It captures stdout and stderr separately, normalizes the result into statuses such as success, runtime error, compilation error, timeout, and resource limit, then destroys the sandbox."
