# ADR 0034: Let each Workspace Host own its Project catalog

## Status

Accepted

## Context

A Project registration identifies a repository path that only the Workspace Host on that machine can resolve, inspect, and authenticate. The Host uses that identity to read Git state, capture current `HEAD`, create managed worktrees, restore Sessions, and perform safe cleanup.

If Desktop separately owned Project records, Project Session creation would cross two durable authorities and remote execution would require synchronizing client-local paths with Host-local filesystem state. A local path is not meaningful to another Host and must not become a global product identity.

## Decision

Each Workspace Host owns its Project catalog and persists it in that Host's database.

For the initial Local Host:

- Project queries and mutations use the authenticated Host Protocol;
- Desktop and renderer keep only disposable client projections of Host-owned Project records;
- Desktop does not maintain a second Project database;
- Electron main may own native folder-picker behavior but passes the selected path to a Host registration command rather than validating or persisting the Project itself; and
- all canonicalization, Git inspection, repository identity, path validation, and registration policy run in the Local Host.

An initial Project represents one Git repository registered on that Host. Registration requires:

- a canonical repository-root path;
- a valid Git repository;
- a valid committed current `HEAD`; and
- a repository identity sufficient to authenticate future worktree operations.

Non-Git folders and repositories without a commit are deferred and fail with actionable guidance. Existing repositories remain at their external paths and are not moved. Projects created or cloned by Space Zero may live under `<Space Zero Home>/projects` when those flows are implemented.

The Host stores a stable Project ID rather than using the filesystem path as the public identity. It also stores the canonical path and relevant repository identity metadata. Duplicate registration of the same authenticated repository resolves to the existing Project rather than creating competing records.

A Project path cannot be silently rewritten while managed Session worktree metadata depends on its repository identity. Relocation and recovery require an explicit Host workflow that re-authenticates the repository and preserves or safely rejects existing Session relationships.

### Remote Hosts

A future Remote Host owns its own Project/workspace catalog. A Local Host path is never sent to a Remote Host as if it were portable.

A later Remote Session or Session Handoff design may link local and remote Project records through durable source identity such as a Git repository/forge reference. That logical cross-Host identity, clone/provisioning behavior, and control-plane metadata are deferred.

## Rationale

The Host that has filesystem and Git authority should own the records required to exercise that authority. This avoids mixed Desktop/Host persistence, path synchronization, and commands whose validity depends on client-local state.

Stable Host-local Project IDs keep protocol and UI identity separate from mutable filesystem presentation. Deferring cross-Host source identity avoids treating local paths as distributed identifiers.

## Consequences

- Project registration requires Host Protocol commands and Host-side validation.
- Desktop's native folder picker remains a UI/native adapter, not Project policy or persistence.
- Project lists recover from the Host after renderer or Desktop restart.
- Local Host database backup and migration include Project catalog records but not repository contents.
- Future Remote Host and Handoff work needs an explicit logical repository/source-link model.
- Path relocation and missing repositories require recovery states rather than direct record editing.

## Alternatives Considered

- **Desktop owns Projects and sends paths to the Host per operation** — rejected because it creates split durable authority and lets the client provide stale or untrusted filesystem identity repeatedly.
- **Duplicate Project records in Desktop and Host databases** — rejected because synchronization, conflict, deletion, and migration semantics would be unnecessary and error-prone.
- **Use canonical filesystem path as Project ID** — rejected because paths are mutable, machine-specific, privacy-sensitive, and unsuitable for future Remote Hosts.
- **Define one global Project record spanning all Hosts immediately** — rejected because Remote Host provisioning and repository source identity are not yet implemented.

## Review Trigger

Revisit this decision if:

- a Space Zero control plane introduces a durable account-level repository/project identity;
- Remote Session placement requires one logical Project to coordinate multiple Host-local workspaces;
- builders need robust repository relocation while managed Sessions remain active; or
- a non-filesystem Project source becomes part of the implemented product.
