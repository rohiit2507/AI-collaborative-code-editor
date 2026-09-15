# Part 9.1 - Secure Code Execution Architecture

## Scope

This document defines the secure execution design. The `/api/execute` endpoint validates authenticated requests, queues jobs, and delegates code execution to a Docker-only worker. User code never runs directly inside the Node.js API process.

## Target Flow

```text
Monaco Editor
    |
    | POST /api/execute
    v
Execution API
    |
    | authenticate, validate, authorize, create job
    v
Execution Queue
    |
    v
Execution Worker
    |
    | create one disposable sandbox per job
    v
Docker Sandbox
    |
    | language runtime + limits + no network
    v
Result Normalizer
    |
    v
Browser
```

## Responsibilities

### Frontend

The Run action sends:

```json
{
  "roomId": 1,
  "fileId": 12,
  "language": "python",
  "code": "print(\"Hello World\")"
}
```

The frontend should display a structured result instead of treating every response as plain text:

```json
{
  "jobId": "...",
  "status": "success",
  "stdout": "Hello World\n",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 42
}
```

### Execution API

The backend API is responsible for:

- authenticating the request
- validating the language, code size, room, and file access
- creating an execution job
- returning a job id or a completed result
- never executing source code in the API process

The API must reject unsupported languages and oversized requests before a job reaches a worker.

### Queue

The queue provides backpressure. It prevents one user or room from creating unlimited concurrent processes and gives the system a place to add retries, cancellation, priority, and observability later.

The first implementation can use a small in-process queue for local development. The queue interface should remain independent from the HTTP route so it can later be replaced by Redis or another durable job system.

### Worker

A worker takes one job at a time, selects a language runner, creates a disposable sandbox, captures stdout and stderr, normalizes the outcome, and destroys the sandbox in a `finally` path.

Workers must not have access to request secrets, database credentials, or the main application process memory.

## Result States

The API should normalize execution outcomes into a small stable set:

| Status              | Meaning                                             |
| ------------------- | --------------------------------------------------- |
| `success`           | Process exited with code 0 and no execution failure |
| `runtime_error`     | Process ran but exited with a non-zero code         |
| `compilation_error` | A compiled language failed during compilation       |
| `timeout`           | The process exceeded the execution deadline         |
| `resource_limit`    | CPU, memory, process, or output limit was exceeded  |
| `system_error`      | The executor or infrastructure failed               |

`stdout` and `stderr` must remain separate so the UI can render `OUTPUT` and `ERROR` independently.

## Language Runner Contract

Every language runner should expose the same conceptual contract:

```text
run(sourceCode, limits) -> {
  stdout,
  stderr,
  exitCode,
  status,
  durationMs
}
```

Initial order:

1. Python
2. JavaScript
3. C++
4. Java

A runner should define its source filename, compile command if needed, run command, and expected output behavior. The API should not contain language-specific shell commands.

## Sandbox Policy

Each execution must use a new disposable container or equivalent isolated runtime with:

- no network access
- read-only image layers
- a temporary working directory only
- a non-root user
- bounded CPU
- bounded memory
- bounded process count
- bounded output size
- a hard wall-clock timeout
- forced cleanup after completion or failure

The worker must pass source code through a controlled temporary input path. It must never interpolate raw source code into a shell command.

The sandbox must not receive:

- `JWT_SECRET`
- database connection strings
- cookie values
- host filesystem mounts
- Docker socket access
- unrestricted environment variables

## Request and Access Rules

Execution should require authentication. If execution is tied to a room or file, the backend must verify that the authenticated user has permission to read that file before enqueueing the job.

The current project still uses owner-only room authorization. That is acceptable for the first secure execution slice; editor/viewer roles can be expanded with the later permissions milestone.

## Implementation Order

1. Define the execution request and result types.
2. Replace the placeholder response with validation and a non-executing job boundary.
3. Add a bounded local queue interface.
4. Add a Python Docker worker with explicit limits.
5. Add structured result rendering in the editor.
6. Add JavaScript and C++ runners.
7. Add cancellation, durable queueing, and execution history.
8. Run security tests against infinite loops, large output, filesystem access, network access, and process spawning.

## Runtime Availability

The executor uses the Docker CLI and fails closed when Docker is unavailable. It never falls back to `child_process` for running source code, `eval`, `vm`, or a host shell. Docker Desktop or a Docker Engine is required to run code locally.

## Security Checks

The useful contract and security checks are:

- missing code or language returns `400`
- unsupported language returns `400`
- oversized code returns `413`
- unauthenticated execution returns `401`
- valid input reaches the Docker-only worker
- infinite loops are terminated by the wall-clock timeout
- network access is unavailable inside the container
- host filesystem and environment secrets are not mounted
- oversized output is truncated and classified as a resource limit
- the container is removed after success, failure, or timeout

These checks prove the API boundary and the sandbox trust boundary without creating a host-execution vulnerability.
