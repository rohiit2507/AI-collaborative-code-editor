# Part 14 Notes - Production Deployment, Scalability & Final Product Polish

## Status

Part 14 is implemented as a production-readiness foundation in the repository. A public domain, managed infrastructure, HTTPS certificate, and internet-facing load test still require deployment-provider access and are not claimed as complete.

## Architecture audit

- Next.js serves the browser IDE and exposes only `NEXT_PUBLIC_*` values.
- Express owns authentication, rooms, files, AI, execution authorization, health checks, and Socket.IO events.
- Yjs is a separate WebSocket process and verifies the HTTP-only JWT before accepting a room connection.
- PostgreSQL stores users, rooms, files, chat, versions, and migration state.
- Docker execution is isolated from the backend process through a Docker worker with no network, read-only filesystem, non-root user, CPU/memory/PID/output/time limits.
- There is no host-side `eval` or shell fallback. The remaining architectural limitation is that Yjs and room authorization currently support owner-only collaboration.

## Environments and secrets

Development uses local URLs and a local database. Testing uses the backend test runner and frontend production build. Production should inject `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `AI_MODEL`, `FRONTEND_URL`, `CORS_ORIGIN`, `YJS_URL`, and `NEXT_PUBLIC_*` service URLs through the hosting platform.

`OPENAI_API_KEY` is server-only. It must never use a `NEXT_PUBLIC_` prefix or be placed in frontend code. Production requires a strong JWT secret and HTTPS origins.

## Database and deployment

`backend/src/migrate.js` applies sorted SQL migrations once and records each filename in `schema_migrations`. Compose runs the migration service before backend and Yjs. PostgreSQL uses a pool with bounded connections, idle timeout, and connection timeout. A real deployment still needs managed backups, restore drills, encrypted storage, and migration rollback procedures.

Compose provides PostgreSQL, migration, backend, Yjs, and standalone Next.js services. The execution sandbox remains a separate Docker boundary. A reverse proxy should terminate TLS, route the frontend and API, and forward WebSocket upgrades to Yjs.

## Abuse protection and observability

Global request limiting remains enabled. Authentication has a stricter limit; AI is limited to 30 requests per 15 minutes per client; execution is limited to 10 requests per minute per client. JSON bodies are bounded, code output and execution resources are bounded, and protected routes verify authentication and room ownership.

Structured JSON logs, `/api/health`, and `/api/readiness` provide the base for log shipping and orchestration. Production should add request IDs, metrics, error tracking, alerts, and dashboards for API latency, database pool saturation, WebSocket connections, queue depth, execution failures, and AI spend.

## Scalability plan

- 1-10 users: one backend, one Yjs process, pooled PostgreSQL, and a bounded execution queue.
- 100 users: add a reverse proxy, horizontal backend replicas, shared Socket.IO adapter, and a dedicated execution worker pool.
- 1,000+ users: move Yjs state/awareness to a durable or sharded collaboration tier, use Redis for cross-instance events, use object storage for large project content, and isolate execution workers on separate nodes.
- AI and execution need per-user quotas, queue backpressure, cancellation, and cost telemetry.

## Security review

Parameterized SQL, HTTP-only cookies, Helmet, CORS allowlists, request limits, authorization middleware, and Docker restrictions are present. Review before launch: membership roles, CSRF strategy for cookie-authenticated mutations, dependency scanning, Docker-enabled sandbox tests, secret rotation, backups, and penetration testing.

## Demo flow

Register, log in, create a room, open the editor, show files and presence, edit a file, send chat, execute code, show isolated output, ask AI to explain or generate code, inspect version history, restore a snapshot, and show health/readiness endpoints. For a portfolio demo, state clearly which pieces are local and which are deployed.

## Placement answers

Explain that Yjs provides CRDT convergence, Socket.IO carries application events, PostgreSQL provides durable metadata, and Docker provides a constrained execution trust boundary. For 10,000 users, separate stateless API replicas, shared WebSocket infrastructure, worker queues, managed PostgreSQL, object storage, quotas, and observability are required. The current project is a secure local/portfolio foundation, not yet a claim of that scale.
