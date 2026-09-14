---
title: Space Zero Coding Standards
---

# Space Zero Coding Standards

## Principle

Make small, intentional, validated changes that preserve Electron security boundaries, Space Zero product language, project conventions, and long-term maintainability.

## Default Workflow

1. Read `AGENTS.md`.
2. Read `docs/context.md` when the task touches product behavior, domain language, or user-facing concepts.
3. Check ADRs before changing architecture, process boundaries, persistence, packaging, or testing strategy.
5. Understand the requested outcome before editing.
6. Make the smallest focused change that solves the task.
7. Validate the change with relevant checks, tests, or a clear explanation of what could not be run.
8. Report what changed, how it was validated, and any remaining risk.

## Package Manager and Commands

Use `pnpm`.

Common commands:

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Preferred validation before opening a PR:

```bash
./scripts/run_silent "typecheck" pnpm typecheck
./scripts/run_silent "lint" pnpm lint
./scripts/run_silent "unit tests" pnpm test
./scripts/run_silent "e2e tests" pnpm test:e2e
```

`pnpm test:e2e` builds the app, launches Electron through Playwright, and verifies the app shell, IPC bridge, and SQLite health check.

## Source Layout

```txt
src/main      Electron main process: app lifecycle, windows, global main infrastructure
src/preload   Safe typed bridge exposed to the renderer as window.spacezero
src/shared    App-wide shared IPC channels, contracts, and cross-process TypeScript types
src/renderer  React app UI entrypoint, global renderer components, styles, and renderer tests
src/features  Process-aware feature modules split into main, renderer, and shared runtime surfaces
docs          Project docs, ADRs, and architecture decisions
scripts       Project helper scripts
```

For feature module layout, file naming, runtime-specific imports, and UI placement rules, follow `docs/feature-architecture.md`.

Keep process-specific code in the right layer:

- Main process: native app lifecycle, filesystem, child processes, SQLite, credentials, Git/GitHub, agent orchestration.
- Preload: small typed bridge only. No business logic.
- Renderer: React UI only. No raw Node.js, filesystem, SQLite, shell, or secret access.
- Shared: serializable types and constants used across process boundaries.

## Electron Security Rules

Preserve these defaults unless a new ADR explicitly changes them:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: join(__dirname, '../preload/index.mjs')
}
```

Rules:

- Do not enable `nodeIntegration` in renderer windows.
- Do not expose raw `ipcRenderer`, `fs`, `child_process`, database clients, tokens, or arbitrary command execution to the renderer.
- Expose only narrow, typed APIs through preload.
- Validate untrusted renderer input in main-process IPC handlers before touching files, processes, databases, or credentials.
- Keep external links opening through `shell.openExternal` and deny uncontrolled new windows.
- Treat agent output, project file content, and webview content as untrusted unless explicitly sanitized.

## IPC Conventions

- Define channel names and shared contracts in `src/shared`.
- Implement `ipcMain.handle(...)` handlers under `src/main/ipc`.
- Expose renderer APIs from `src/preload/index.ts` through `contextBridge.exposeInMainWorld('spacezero', api)`.
- Renderer code should call `window.spacezero.*`, never Electron APIs directly.
- Prefer request/response IPC for queries and commands.
- For long-running sessions or streaming output, design explicit subscribe/unsubscribe channels and document lifecycle/cleanup behavior.
- Keep IPC payloads serializable and minimal.
- Use `zod` for validation when IPC inputs are user-provided, path-like, command-like, or externally sourced.

## SQLite and Data Access

- SQLite belongs in the main process.
- Renderer code must access persisted state through typed IPC APIs.
- Keep schema definitions in `src/main/db/schema.ts`.
- Keep database initialization and migration logic in `src/main/db`.
- Enable foreign keys and WAL for local app persistence.
- Avoid leaking local database paths or internals into user-facing UI unless it is explicitly a diagnostics screen.
- Add migrations or documented migration logic when changing durable tables.

## React and UI Conventions

- Use React + TypeScript for renderer UI.
- Use Tailwind CSS utilities for styling.
- Use shadcn/ui-compatible components under `src/renderer/src/components/ui`.
- Keep reusable renderer utilities under `src/renderer/src/lib`.
- Prefer accessible buttons and controls with labels for icon-only actions.
- Use `-webkit-app-region: drag` only for titlebar drag areas and opt interactive children out with `-webkit-app-region: no-drag`.
- Keep user-facing product terms consistent with `docs/context.md`.

## TypeScript and Imports

- Keep TypeScript strict.
- Prefer explicit exported types at process boundaries.
- Keep imports organized by source: Node/Electron, third-party, local.
- Use kebab-case file and folder names with dot suffixes for architectural roles when useful, such as `.service.ts`, `.model.ts`, `.schema.ts`, `.contract.ts`, `.repository.ts`, and `.ipc.ts`.
- Use aliases configured in `electron.vite.config.ts` and TypeScript configs where appropriate:
  - `@renderer/*` for renderer code.
  - `@shared/*` for shared cross-process contracts.
- Do not import renderer-only modules into main/preload code.
- Do not import main/preload-only modules into renderer code.
- Do not create feature root barrels that re-export `main`, `renderer`, and `shared` together.

## Testing Standards

Use the right level of test for the behavior:

- Vitest for unit tests and renderer component tests.
- React Testing Library for user-observable renderer behavior.
- Playwright Electron tests for app launch, IPC, preload, and desktop integration smoke coverage.
- Add regression coverage when fixing bugs.
- Prefer public behavior over implementation details.
- Keep e2e smoke tests minimal and reliable; avoid turning every UI detail into an e2e assertion.

## Dependency Policy

- Use existing dependencies by default.
- Ask before adding a runtime dependency.
- Prefer standard library or small local code for simple needs.
- If a dependency is added, explain why it is worth the maintenance and supply-chain cost.
- Be especially careful with native Electron dependencies because they affect rebuilds, packaging, and cross-platform distribution.

## ADR Triggers

Create or update an ADR when changing decisions around:

- Desktop shell choice or Electron/Tauri/native tradeoffs.
- Main/preload/renderer boundaries.
- IPC shape or security model.
- Local persistence and migrations.
- Agent process orchestration.
- Git/GitHub integration boundaries.
- Packaging, signing, updates, or release distribution.
- Major testing strategy changes.

Do not create ADRs for routine component styling, small bug fixes, or temporary implementation details.
