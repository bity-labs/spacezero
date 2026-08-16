---
title: Use Pure Renderer Views with App Containers
---

## Status

Accepted

## Context

Space Zero is an Electron desktop app with a strict renderer/preload/main boundary. Renderer UI often needs data or actions from application services exposed through `window.spacezero`, but visual UI also needs to be easy to prototype, review, test, and reuse.

The local Storybook workbench introduced by PRD #431 renders real renderer components outside the Electron application. Components that directly call preload APIs, depend on router/runtime state, or combine loading/persistence behavior with markup are difficult or impossible to render in Storybook without mocking the whole app runtime.

Recent Settings Storybook work exposed this friction:

- `GeneralSettingsScreen` works well because it is a pure screen that receives props and callbacks.
- Account and GitHub settings are harder to story because `AccountSettings` currently calls `window.spacezero.github` directly.
- The Settings sidebar is embedded in `SettingsLayout`, so Storybook currently needs a visual mock instead of a real pure `SettingsSidebar` component.
- Account menu rendering and app behavior are mixed enough that layout stories cannot safely use the real menu without pulling in application assumptions.

Space Zero needs a durable renderer pattern that keeps application behavior connected to Electron while keeping visual surfaces independently renderable.

## Decision

Renderer UI should prefer a **container + pure view** split for screens and composed UI surfaces that load data, call preload APIs, use router behavior, or coordinate app state.

Use this shape:

```txt
Container / Page / Connected component
  - loads data
  - calls window.spacezero.* or renderer clients/hooks that call it
  - handles routing, persistence, subscriptions, commands, and side effects
  - maps app/runtime state into view props

Pure View / Screen / Presentational component
  - receives serializable visual state through props
  - receives callbacks for user intent
  - renders markup, layout, accessibility, and visual states
  - does not call window.spacezero, Electron APIs, Node APIs, SQLite, filesystem, Git, GitHub, agent runtime, or app-global side effects directly
```

Naming does not need to be rigid, but common names are:

```txt
*-page.tsx or *-container.tsx      # app-connected behavior
*-screen.tsx or *-view.tsx         # pure visual component
*.fixtures.ts / *.fixtures.tsx     # Storybook/test visual data
*.stories.tsx                      # Storybook stories using real pure views
```

For example:

```txt
account-menu-container.tsx
account-menu.tsx

github-account-settings-container.tsx
github-account-settings-screen.tsx

settings-layout.tsx
settings-sidebar.tsx
```

Storybook stories should import the pure view/screen and pass fixture props. They should not mock `window.spacezero` just to render an app-connected container, except for narrow compatibility smoke checks where explicitly justified.

## Rationale

This pattern preserves the Electron security model while improving UI iteration:

- Storybook can render real Space Zero UI without launching Electron.
- Visual components become easier to inspect across themes, fonts, layout widths, loading states, empty states, and errors.
- Application behavior remains in containers that can use preload/IPC and app stores intentionally.
- Renderer tests can cover pure UI behavior with simple props and cover containers through public behavior where needed.
- UI surfaces become easier to compose: a Settings layout story can use a real `SettingsSidebar` once that sidebar is pure.
- The app avoids duplicating UI in Storybook-only mocks as features mature.

This is especially important for Space Zero because the renderer is UI-only. App data, persistence, GitHub, filesystem, update checks, and agent operations belong behind typed preload/IPC or renderer clients/hooks, not inside reusable visual components.

## Consequences

- New app-connected renderer screens should usually expose a pure screen/view component before or while adding Storybook stories.
- Existing mixed components do not require immediate big-bang refactors, but should be split when they are touched for UI design, Storybook coverage, or substantial behavior changes.
- Storybook should prefer real pure components and fixture props over fake visual copies.
- Containers may remain un-storied when their only job is runtime wiring; behavior should be validated through renderer/unit/e2e tests as appropriate.
- A component can stay unsplit when it is already pure, small, and has no runtime dependencies.
- Avoid over-splitting tiny primitives or adding containers with no behavior. The split is for boundaries where side effects, app state, routing, or IPC would otherwise leak into presentational UI.

## Alternatives Considered

- **Story app-connected containers directly.** Rejected as the default because it encourages mocking Electron/preload APIs in Storybook, couples visual review to app runtime behavior, and makes stories fragile.
- **Duplicate UI in Storybook mocks.** Rejected because stories would drift from the real application and stop being useful design contracts.
- **Put all renderer behavior inside pure components with hooks.** Rejected because it spreads app side effects through reusable UI and makes process-boundary review harder.
- **Require every component to be pure/presentational.** Rejected as too rigid. Top-level containers, route components, and app shell components may own wiring behavior when that is their purpose.

## Review Trigger

Revisit this decision if the split creates excessive boilerplate, if Storybook stops being part of the local UI workflow, if React architecture moves to a different data-loading pattern that changes the container boundary, or if Electron process-boundary rules change substantially.
