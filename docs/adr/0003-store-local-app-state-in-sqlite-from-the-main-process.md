---
title: Store Local App State in SQLite from the Main Process
---

## Status

Accepted

## Context

Space Zero needs durable local state for projects, sessions, settings, future task links, GitHub metadata, agent summaries, and workflow state. This data should be local-first and available without requiring a hosted backend in v0.

The Electron renderer must not receive raw database access because it would violate the process/security boundary and make persistence harder to validate.

## Decision

Space Zero stores local app state in SQLite using `better-sqlite3` from the Electron main process.

Schema definitions live in `src/main/db/schema.ts`. Database initialization and migration logic live in `src/main/db`. Renderer code accesses persisted state only through typed IPC APIs.

The database enables WAL and foreign keys.

## Rationale

SQLite is a good fit for a local desktop workspace:

- Single-file local persistence.
- Fast enough for local project/session metadata.
- Works offline.
- Mature ecosystem with `better-sqlite3` and Drizzle.
- Avoids requiring a backend before the desktop product shape is validated.

Keeping SQLite in main process preserves the renderer security boundary and centralizes migrations, validation, and future sync logic.

## Consequences

- Native dependency rebuilds and packaging must account for `better-sqlite3`.
- Schema changes need migration discipline.
- Renderer features that need persisted state require IPC APIs.
- Future cloud/team sync must treat SQLite as the local source/cache boundary and define conflict/sync behavior separately.

## Alternatives Considered

- Renderer localStorage/IndexedDB — easy, but weaker fit for structured app state and cross-process desktop workflows.
- JSON files — simple, but brittle for relational session/project/task data and migrations.
- Hosted database first — premature for v0 and weaker offline/local-first behavior.
- Direct renderer SQLite access — simpler superficially, but violates Electron security boundaries.

## Review Trigger

Revisit if data volume, query patterns, multi-device sync, team collaboration, or hosted product requirements outgrow local SQLite as the primary persistence layer.
