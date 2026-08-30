---
title: Store Desktop settings in a main-owned JSON file
---

## Status

Accepted

## Context

Space Zero v0.1 separates Desktop-native behavior from Workspace Host-owned Project and Session behavior. ADR 0028 assigns Project catalog and Project Session state to Workspace Host SQLite, and explicitly excludes Desktop window, layout, update, and other client-local settings from that Host database.

The Desktop app still needs durable local preferences such as interface language and, soon, keyboard shortcuts. These settings are user-facing product preferences, but they are Desktop-local and do not require relational queries or event sourcing.

The renderer must not receive raw filesystem or database access. Settings must therefore be owned by Electron main and exposed through a narrow preload API.

## Decision

The project uses a Desktop main-owned JSON settings file for Desktop-local settings and preferences.

The initial file lives under Electron application data as:

```txt
<app userData>/settings.json
```

Electron main owns reading, validation, defaulting, and writing. Renderer code accesses settings only through typed preload/IPC APIs.

The initial settings shape is:

```json
{
  "languagePreference": "system"
}
```

Language preferences support `system`, `en`, and `fr`. When set to `system`, Electron main resolves the language from `app.getPreferredSystemLanguages()[0] || app.getLocale() || "en"`. Unsupported system base languages fall back to `en`.

JSON writes must be atomic enough for local settings by writing a temporary file and renaming it over the target file. Invalid or missing individual keys fall back to defaults. Secrets must not be stored in this file.

## Rationale

A JSON settings store matches the current shape of Desktop preferences:

- small key-value data;
- human-readable during development and support;
- no SQLite schema or migration overhead for simple preferences;
- compatible with future keyboard shortcut configuration;
- safely owned by Electron main without exposing filesystem access to the renderer; and
- clearly separate from Workspace Host SQLite, which owns Project and Session domain state.

This mirrors the broad pattern used by editors such as VS Code, where user-facing settings are configuration-file based rather than relational database rows.

## Consequences

Desktop settings have a durable app-data home without coupling them to the Workspace Host.

Adding new preferences requires extending the typed settings shape, validation/defaulting, preload API where needed, and tests. Settings must stay non-secret; credentials continue to live in their dedicated secure owner.

The first implementation is app/user scoped only. Workspace, project, profile, language-specific, or remote-synced settings scopes are deferred.

## Alternatives Considered

- Renderer `localStorage` — rejected for user-facing Settings preferences because it scatters persistence in the renderer, is less native-aware, and does not scale well to shortcuts or multi-window consistency.
- Workspace Host SQLite — rejected because Desktop-local preferences are outside the Host's Project and Session ownership boundary per ADR 0028.
- Desktop SQLite — rejected for now because the current settings are simple key-value preferences and do not justify a relational store or migrations.
- Hosted/synced settings service — rejected as premature for local v0.1 Desktop preferences.

## Review Trigger

Revisit this decision if settings require multi-device sync, team/workspace scopes, complex queries, encrypted values, conflict resolution, or if JSON migration/versioning becomes too complex for the file-based approach.
