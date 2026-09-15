# Part 10 - Production Readiness, Testing & Deployment

## Current scope

Part 10 turns the project from a local development application into a deployable portfolio project. The repository now includes environment-driven service URLs, backend security middleware, structured logs, health/readiness checks, database hardening indexes, container definitions, Compose topology, and CI validation.

## Security baseline

- `CORS_ORIGIN` controls allowed browser origins.
- Helmet adds secure HTTP response headers.
- General API and authentication-specific rate limits are enabled.
- JSON request bodies are bounded to prevent oversized request abuse.
- Production cookies use `secure` and `sameSite=strict`.
- Production startup rejects weak or missing JWT secrets.
- Parameterized PostgreSQL queries remain the database access pattern.
- Execution remains Docker-only and fails closed when Docker is unavailable.
- Production errors return generic messages while detailed context is logged as JSON.

## Health endpoints

- `GET /api/health` checks application and database connectivity.
- `GET /api/readiness` is intended for container orchestration readiness probes.

## Database hardening

`backend/migrations/001_hardening.sql` adds indexes for user lookup, room ownership, file lookup, and room message history. It also adds a case-insensitive unique index for email addresses. Migrations should run in order during deployment and should be checked against existing development data before applying.

## Tests and CI

Backend unit tests cover queue serialization, queue capacity, supported executor definitions, and execution limits. GitHub Actions runs backend syntax/tests and the frontend production build on pushes and pull requests.

Runtime Docker security tests still require a Docker-enabled CI runner. Those tests should cover infinite loops, large output, network access, filesystem access, process spawning, and container cleanup.

## Containers

`docker-compose.yml` defines:

- PostgreSQL with a persistent volume and health check
- Backend API
- Yjs WebSocket server
- Next.js standalone frontend

The Compose file requires `POSTGRES_PASSWORD` and `JWT_SECRET` from the deployment environment. Do not commit a production `.env` file.

## Remaining production work

- Add API integration tests with a disposable PostgreSQL database.
- Run Docker security tests in CI.
- Add execution history and metrics.
- Add reverse proxy/TLS termination and a production domain.
- Add frontend component and browser tests.
- Add centralized log shipping and alerting.
- Complete role-based room permissions and deployment secrets management.
