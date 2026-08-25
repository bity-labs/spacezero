---
title: Adopt Process-Aware Feature Modules
---

## Status

Accepted

## Context

Space Zero is an Electron desktop app. Its code must respect real runtime boundaries between the main process, preload script, renderer, and shared contracts. Those boundaries are security-sensitive because Space Zero will eventually access local repositories, run agent sessions, execute Git commands, store credentials, use SQLite, and render untrusted project or agent output.

The current source layout is organized primarily by Electron process:

```txt
src/main
src/preload
src/renderer
src/shared
```

That is a good early Electron layout, but as product areas grow, process-only folders can scatter one feature across many distant locations. For example, a future `projects` capability may need main-process IPC handlers, persistence logic, renderer components, hooks, and shared IPC contracts.

A pure feature-first layout is also risky in Electron if it mixes privileged and renderer code under one root barrel. Renderer code must never accidentally import main-process code, Node.js APIs, SQLite clients, Electron main APIs, child-process helpers, credentials, or filesystem access.

## Decision

Space Zero uses **process-aware feature modules** for product features.

Feature modules live under `src/features/{feature-name}/` and are split by runtime:

```txt
src/features/{feature-name}/
├── main/      # Electron main-process feature implementation
├── renderer/  # React renderer feature UI, hooks, and renderer helpers
└── shared/    # Serializable feature contracts, schemas, constants, and types
```

Each runtime subfolder may expose its own local `index.ts`. Feature roots must not expose a single barrel that re-exports `main`, `renderer`, and `shared` together.

The stable dependency rule is:

```txt
main     -> feature shared, main libraries, infrastructure
preload  -> feature shared, global shared contracts
renderer -> feature renderer, feature shared, renderer libraries
shared   -> serializable types/constants/schemas only
```

Forbidden dependencies include:

```txt
renderer -> feature main
renderer -> src/main
renderer -> Electron/Node/SQLite/child_process/credentials
shared   -> renderer React code
shared   -> main Electron/Node/SQLite code
```

Existing process entrypoints remain:

```txt
src/main
src/preload
src/renderer
src/shared
```

They compose the application and import the correct feature runtime surfaces.

## Rationale

This combines the useful parts of feature-based architecture with Electron's security model:

- Feature ownership stays discoverable as product areas grow.
- Main-process privilege remains visually and technically separated from renderer UI.
- Renderer modules can be organized by product concept without receiving native access.
- Shared contracts make IPC boundaries explicit and reviewable.
- Each feature can grow only the runtime surfaces it needs.

The structure also matches Space Zero's accepted process-boundary decisions:

- `docs/adr/archive/v0/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/archive/v0/0003-store-local-app-state-in-sqlite-from-the-main-process.md`

## Consequences

- New product features should be added under `src/features/{feature-name}/` with explicit `main`, `renderer`, and/or `shared` runtime folders.
- Agents and maintainers must choose imports by runtime-specific subpath rather than from a root feature barrel.
- IPC capabilities usually require coordinated changes across feature `shared`, `main`, `preload`, and `renderer` surfaces.
- Reusable renderer UI remains under `src/renderer/src/components` and `src/renderer/src/components/ui`, not in feature shared folders.
- Reusable main-process infrastructure remains under `src/main`, not in renderer or shared folders.
- Existing app-level code does not need a big-bang migration; features should move into this shape as they are introduced or substantially changed.

## Alternatives Considered

- Keep only process-based folders — simple and Electron-native, but likely to scatter product features as the app grows.
- Use pure feature folders with one root barrel — convenient imports, but too easy to leak privileged main-process code into renderer code.
- Duplicate feature concepts independently under `src/main`, `src/renderer`, and `src/shared` — safe, but less discoverable and more likely to drift.
- Put all feature business logic in renderer — simpler superficially, but violates Space Zero's security and persistence boundaries.

## Review Trigger

Revisit this decision if the layout creates significant import friction, if build tooling cannot enforce boundaries, if utility-process or multi-window architecture changes runtime ownership, or if feature modules become too shallow to justify their structure.
