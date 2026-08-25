# Client Runtime

Browser-safe Host client package.

It uses Effect HttpApi Client and fetch internally. UI callers receive plain Promise APIs and plain values rather than Effect runtime types.

Current APIs:

- `createLocalHostConnectionClient(...)` connects to the authenticated Host and validates the first typed SSE event.
- `createProjectCatalogClient(...)` lists Projects and registers one selected path using a generated command ID and a fresh scoped descriptor per operation.
- `createProjectSessionClient(...)` lists Project Sessions, creates one managed-worktree Session for a Project, submits prompts, lists message projections, and subscribes to replayable Project Session events with durable cursor catch-up.
- `createHarnessAuthClient(...)` reports non-secret provider auth status and submits write-only API-key changes over the authenticated Host Protocol.

The runtime retains neither Project paths, Session worktree paths, nor capabilities after each Promise settles. Event subscriptions use authenticated streaming `fetch()`, reacquire descriptors when reconnecting, and never put capabilities in URLs. Electron IPC is not used to proxy Host Project or Session operations.

Richer projections, archive/delete, source selection, first-prompt renaming, OAuth login flows, and full Workspace Tool UI/projection support remain deferred.
