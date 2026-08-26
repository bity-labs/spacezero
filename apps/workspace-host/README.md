# Workspace Host

Active ordinary-Node Workspace Host for authenticated Desktop ↔ Host connectivity, the Host-owned Project catalog, and Project Session execution.

The Host binds an Effect HttpApi server to loopback, performs protected one-time bootstrap, holds supervisor/client capabilities in Host memory, and serves authenticated `/v1/connection`, `/v1/events`, `/v1/projects`, `/v1/project-sessions`, `/v1/harness-auth`, and `/v1/admin/*` endpoints.

## Project catalog

ADR 0034 is authoritative: each Workspace Host owns its Project catalog. Electron may select a folder, but canonicalization, Git inspection, repository identity, duplicate policy, IDs, command receipts, migrations, and persistence run in the Host.

The initial catalog uses conventional relational SQLite tables, not Project Session event sourcing. The database file defaults to `workspace-host.sqlite` under the Host process working directory; Desktop launches the Host with private application data as cwd. Tests pass an explicit temporary database path.

Startup applies numbered Effect SQL migrations over `@effect/sql-sqlite-node@4.0.0-rc.109` and Node.js `22.23.1` built-in `node:sqlite` before the HTTP server listens. The driver keeps WAL enabled, foreign keys enabled, and a 5000 ms busy timeout.

`POST /v1/projects` requires `projects:register`; `GET /v1/projects` requires `projects:read`. Public failures are static and do not include paths, Git output, SQL text, tokens, stack traces, or Effect causes.

## Project Sessions

ADR 0028 and ADR 0029 are authoritative for Project Sessions. The Host allocates a permanent unique Session name from bundled normalized French wine appellations, persists Session creation events and a rebuildable projection in SQLite, creates a managed Git worktree under `<Space Zero Home>/worktrees/<project-id>/<session-id>/`, and exposes path-free summaries through `POST /v1/project-sessions` and `GET /v1/project-sessions`.

Prompt submission persists user/agent message-boundary events, invokes the Pi Adapter with one durable conversation identity per Project Session, and admits prompts before background completion. `GET /v1/project-sessions/:sessionId/events?after=<sequence>` uses authenticated fetch/SSE with durable cursor catch-up and live assistant/tool delivery. `/v1/harness-auth/providers` exposes non-secret Pi provider auth-method discovery; API-key set/remove endpoints persist credentials in Host-private Pi auth storage.

Desktop passes Space Zero Home through the protected bootstrap frame; it is not exposed in renderer descriptors, URLs, argv, or environment variables. Dirty base-checkout changes are excluded from the managed worktree and represented as a warning boolean.

Deferred: archive/delete, source selection, GitHub/remotes, full Workspace Tool registry, OAuth login flows, private-Node deployment, production dependency pruning, and release integrity checks.
