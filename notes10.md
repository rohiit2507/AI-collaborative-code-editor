# Part 10 - Production Readiness Interview Notes

## 1. What changed in Part 10?

We hardened the development project for deployment. The backend now uses environment-driven CORS, secure headers, rate limits, bounded request bodies, structured logs, health/readiness endpoints, and production-safe cookie behavior. The repository also contains database indexes, containers, Compose, CI, and automated unit tests.

## 2. Why must production configuration come from environment variables?

Deployment environments have different database URLs, domains, secrets, and service locations. Environment variables keep secrets out of source control and let the same artifact run in development, testing, and production.

## 3. Why use both health and readiness endpoints?

Health describes whether the service is alive and can reach its database. Readiness tells an orchestrator whether the service is ready to receive traffic. A process can be alive but not ready if its database is unavailable.

## 4. What does Helmet provide?

Helmet adds security-related HTTP headers that reduce common browser attack surfaces, such as unsafe framing and content-type sniffing. It is a baseline control, not a replacement for authorization or input validation.

## 5. Why do we rate-limit authentication separately?

Login and registration are high-value abuse targets. A stricter authentication limit reduces brute-force and account-creation abuse while the general API can retain a higher operational limit.

## 6. How is the database hardened?

The migration adds indexes for common ownership, room, file, and message-history lookups and a case-insensitive unique email index. PostgreSQL parameterized queries continue to protect values from SQL injection.

## 7. What does CI validate?

GitHub Actions installs dependencies, runs backend unit tests and syntax checks, and builds the frontend for every push to main and every pull request.

## 8. Why use Docker Compose?

Compose gives the local and deployment environments a repeatable service topology: PostgreSQL, backend, Yjs, and frontend. It also defines service dependencies, health checks, ports, volumes, and required secrets in one place.

## 9. What remains after Part 10?

A fully operated production system still needs disposable database integration tests, Docker security tests in CI, browser tests, reverse proxy/TLS deployment, metrics, centralized logs, alerts, execution history, and complete editor/viewer permissions.

## Strong interview answer

"Part 10 hardens the collaborative editor for production use. We moved URLs and secrets into environment configuration, added secure headers and rate limiting, bounded request bodies, improved PostgreSQL connection handling, added readiness checks and structured logs, created database indexes, containerized the services, and automated backend/frontend validation in GitHub Actions. The secure execution path remains Docker-only, and the remaining runtime security tests are designed to run on a Docker-enabled CI environment."
