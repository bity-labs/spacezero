# Workspace Host

Active ordinary-Node Workspace Host for the authenticated connectivity tracer.

It builds to strict ESM, binds an Effect HttpApi server to an ephemeral IPv4 loopback port, performs one-time protected bootstrap, holds in-memory supervisor/client capabilities, serves one authenticated connection query and typed SSE event, and shuts down through Effect-owned scopes. Startup and shutdown diagnostics never include credentials.

Deferred: crash restart/reconciliation, durable SSE cursors/reconnect, SQLite, Projects, Sessions, Git/worktrees, Pi integration, Workspace Tools, private-Node deployment, production dependency pruning, and release integrity checks.
