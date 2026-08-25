---
title: Use a User-Configurable Space Zero Home for Managed Workspace Content
---

## Status

Accepted

## Context

Space Zero owns several kinds of local data with different ownership and privacy characteristics. It manages projects, future worktrees, knowledge, artifacts, agent transcripts, credentials, SQLite metadata, logs, and caches.

Keeping all of these in one directory would make the product easy to locate, but would mix user-owned content with private application state and increase the risk of accidentally syncing credentials, transcripts, or databases with a repository. Existing repositories also may already live in locations chosen by the builder and should not be moved merely because they are registered in Space Zero.

## Decision

Space Zero uses two storage areas:

1. **Space Zero Home** is a user-configurable, user-owned root for managed workspace content. It defaults to `~/SpaceZero`.
2. **OS application data** remains the default location for private application data such as SQLite, model credentials, raw Pi transcripts, logs, and caches.

New projects and repositories created or cloned by Space Zero use:

```text
<Space Zero Home>/projects
```

Future managed content uses sibling directories such as `worktrees`, `knowledge-base`, and `artifacts`.

Existing projects registered from an external folder remain at their existing absolute path and are not moved automatically when Space Zero Home changes.

Changing Space Zero Home affects the default location for future managed content. It does not migrate existing projects, transcripts, or application data in v0.

## Rationale

This provides the predictable, Conductor-like organization of a single user-visible home without treating sensitive application state as project content. It also preserves the user's ownership of existing repositories and avoids surprising filesystem moves.

Keeping private application data in the OS-managed directory follows platform conventions and protects credentials and transcripts from accidental Git tracking or synchronization. A single Space Zero Home setting is simpler for users than configuring every managed content category independently while leaving room for future per-category settings if needed.

## Consequences

- Settings must expose the current Space Zero Home and allow the user to choose another directory.
- Project creation and future repository cloning must resolve their destination through the storage service rather than hard-code a path.
- Existing project records continue to store and use their registered paths.
- Moving Space Zero Home does not currently migrate managed content; future migration must be explicit and report what will move.
- The Knowledge Base can use `<Space Zero Home>/knowledge-base` while remaining separate from project source repositories.
- Raw transcripts and credentials are not included in the user-managed home by default.

## Alternatives Considered

- **Put all data under one Space Zero directory** — rejected because it mixes secrets, app internals, and user-owned content.
- **Keep all new repositories under the current `~/ws/dev` default** — rejected because Space Zero-managed repositories should have a predictable product-owned home.
- **Move or copy existing registered repositories into Space Zero Home** — rejected because registration must not alter user-owned source locations unexpectedly.
- **Configure every data category independently from the start** — deferred because it adds settings complexity before the product has demonstrated a need for separate user locations.

## Review Trigger

Revisit this decision if users require portable installations, multi-machine synchronization of transcripts, encrypted backups, per-category storage locations, or an explicit migration/import workflow for existing managed content.
