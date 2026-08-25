# Host Contracts

Browser-safe Host Protocol package.

It owns strict startup, capability, connection, authorization-error, Project catalog schemas, Project Session create/list schemas, stable public errors, Effect HttpApi declarations, and the derived OpenAPI model. Wire values remain plain HTTP/JSON/SSE values.

Project routes:

- `POST /v1/projects` with scope `projects:register`
- `GET /v1/projects` with scope `projects:read`

Project Session routes:

- `POST /v1/project-sessions` with scope `project-sessions:create`
- `GET /v1/project-sessions` with scope `project-sessions:read`

The public Project projection is limited to `id`, `displayName`, `canonicalPath`, `registeredHeadCommit`, and `createdAt`. Internal Git dir/common-dir paths, filesystem identity, SQL details, command receipts, remotes, and credentials are not contract fields.

Project Session summaries expose stable IDs, wine-derived names, source branch/commit metadata, readiness/recovery state, and dirty-checkout warning booleans. Absolute worktree paths, Git dir/common-dir paths, filesystem identity, cleanup diagnostics, raw Git output, SQL details, Pi transcripts, credentials, and Session event streams are not returned by create/list endpoints.

Persistence implementations, durable event cursors, Electron, React, Pi, Git adapters, and Node APIs remain outside this package.
