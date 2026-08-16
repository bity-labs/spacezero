---
title: ADR 0008 Use Zustand for Renderer UI State
---

## Status

Accepted

## Context

Space Zero has renderer-only state that should survive app restarts but should not become durable product or domain state in SQLite. Examples include sidebar widths, panel visibility, split pane sizes, active local tabs, and other workspace layout memory.

ADR 0003 keeps local app state that is product-significant in SQLite behind main-process APIs. That remains true for projects, sessions, settings, GitHub data, model defaults, and other state owned by Space Zero as a product. However, using main/SQLite for every incidental renderer layout preference adds ceremony and blurs the difference between user-configured settings and UI arrangement memory.

The UI foundation now needs a consistent place for renderer-owned persisted layout state so values such as sidebar width stay synchronized across routes and app restarts.

## Decision

The renderer uses Zustand for renderer-owned UI/view state.

Use Zustand for state such as:

- sidebar widths and open/closed state
- split pane sizes
- active local workspace tabs or panels
- local panel visibility and selection
- browser/preview panel layout state when it is only UI arrangement

Zustand stores may use the `persist` middleware with `localStorage` for UI layout memory that should survive app restarts.

Do not use Zustand as the source of truth for product/domain state owned by main process services, SQLite, utility processes, or external systems. Renderer stores may hold UI projections or selections that reference main-owned entities by ID, but the authoritative data must still come through typed preload/IPC APIs.

External server state such as current GitHub repository, Issue, and Pull Request responses uses a runtime-only TanStack Query cache. That cache deduplicates requests and represents loading/error/freshness; it is neither a Zustand UI store nor authoritative persistence. It is not persisted to localStorage or SQLite and is discarded when the app closes.

## Rationale

Zustand provides a small React-friendly store with minimal ceremony and built-in persistence middleware. It is a good fit for the renderer remembering how the builder arranged the interface.

This keeps layout state close to the renderer while preserving Space Zero's process boundaries:

- main/SQLite owns durable product state and explicit settings
- renderer/Zustand owns UI arrangement and view state
- live main/utility state reaches the renderer through IPC subscriptions and may be projected into UI stores when useful

The project should avoid scattered direct `localStorage` calls. Persisted renderer UI state should be hidden behind named Zustand stores and actions.

## Consequences

- Adding a runtime dependency on `zustand` is accepted for renderer UI state.
- Renderer UI state can be shared across routes without prop drilling.
- UI layout preferences can survive app restarts without creating DB schema or IPC settings APIs.
- Engineers must keep Zustand stores out of main/preload/shared code.
- TanStack Query may cache external server responses only for the running renderer and must refetch through typed IPC; persistent/offline server-state caching requires a separate decision.
- Product settings visible in Settings still belong behind main-owned settings APIs, not Zustand.

## Alternatives Considered

- React state plus direct `localStorage` hooks — acceptable for one value, but it scales poorly and encourages duplicated persistence logic as the workspace grows.
- Main-process settings/SQLite for all UI state — too heavy for incidental UI arrangement memory and risks treating layout state as product data.
- MobX State Tree — powerful for rich object graphs, snapshots, and runtime models, but too heavy for renderer layout state and likely to encourage duplicating main-owned domain state in the renderer.

## Review Trigger

Revisit this decision if renderer UI stores start duplicating authoritative project/session data, if persistence requires migrations or cross-device sync, or if Zustand stores become a source of business logic rather than UI/view state.
