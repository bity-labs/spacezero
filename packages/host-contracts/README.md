# Host Contracts

Browser-safe Host Protocol package.

It owns strict startup, capability, connection, authorization-error, Project catalog schemas, stable public Project errors, Effect HttpApi declarations, and the derived OpenAPI model. Wire values remain plain HTTP/JSON/SSE values.

Project routes:

- `POST /v1/projects` with scope `projects:register`
- `GET /v1/projects` with scope `projects:read`

The public Project projection is limited to `id`, `displayName`, `canonicalPath`, `registeredHeadCommit`, and `createdAt`. Internal Git dir/common-dir paths, filesystem identity, SQL details, command receipts, remotes, and credentials are not contract fields.

Sessions, persistence implementations, durable event cursors, Electron, React, Pi, Git adapters, and Node APIs remain outside this package.
