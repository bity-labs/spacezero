# Workspace Host

Active ordinary-Node Workspace Host for authenticated Desktop ↔ Host connectivity and the Host-owned Project catalog tracer.

The Host binds an Effect HttpApi server to loopback, performs protected one-time bootstrap, holds supervisor/client capabilities in Host memory, and serves authenticated `/v1/connection`, `/v1/events`, `/v1/projects`, and `/v1/admin/*` endpoints.

## Project catalog

ADR 0034 is authoritative: each Workspace Host owns its Project catalog. Electron may select a folder, but canonicalization, Git inspection, repository identity, duplicate policy, IDs, command receipts, migrations, and persistence run in the Host.

The initial catalog uses conventional relational SQLite tables, not Project Session event sourcing. The database file defaults to `workspace-host.sqlite` under the Host process working directory; Desktop launches the Host with private application data as cwd. Tests pass an explicit temporary database path.

Startup applies numbered Effect SQL migrations over `@effect/sql-sqlite-node@4.0.0-rc.109` and Node.js `22.23.1` built-in `node:sqlite` before the HTTP server listens. The driver keeps WAL enabled, foreign keys enabled, and a 5000 ms busy timeout.

`POST /v1/projects` requires `projects:register`; `GET /v1/projects` requires `projects:read`. Public failures are static and do not include paths, Git output, SQL text, tokens, stack traces, or Effect causes.

Deferred: crash restart/reconciliation, durable SSE cursors/reconnect, Project Sessions, managed worktrees, Pi integration, Workspace Tools, private-Node deployment, production dependency pruning, and release integrity checks.
