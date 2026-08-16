---
title: Space Zero Coding Standards
---

# Space Zero Coding Standards

## Principle

Make small, intentional, validated changes that preserve the Desktop/Workspace Host security boundary, Space Zero product language, package dependency direction, and long-term maintainability.

## Default Workflow

1. Read `AGENTS.md`.
2. Read `docs/context.md` when the task touches product behavior, domain language, or user-facing concepts.
3. Read `docs/feature-architecture.md` before adding, moving, or reorganizing feature source.
4. Load only the relevant engineering rules from `docs/engineering/index.md`.
5. Check active ADRs before changing architecture, runtime boundaries, persistence, packaging, authentication, or testing strategy.
6. Understand the requested outcome before editing.
7. Make the smallest focused change that solves the task.
8. Validate with relevant checks and tests, or state clearly what could not be run.
9. Report what changed, what was validated, and any remaining risk.

## Workspace Tooling and Commands

Use `pnpm`. Repository tooling, CI, Workspace Host development, and the packaged Local Host use Node.js `22.23.1`.

Root scripts must provide focused entrypoints across active workspaces:

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Use workspace filters when a focused package or application check is sufficient. Use `scripts/run_silent` for noisy validation when useful.

Preferred validation before opening a PR:

```bash
./scripts/run_silent "typecheck" pnpm typecheck
./scripts/run_silent "lint" pnpm lint
./scripts/run_silent "tests" pnpm test
```

Run the relevant Electron, real-Host, or packaged suites when the change touches those boundaries; do not require every visual change to launch the real Host.

## Repository Layout

The repository is organized by independently runnable applications and explicit packages:

```txt
apps/
  desktop/          Electron shell, React client, native integration, Local Host supervision
  workspace-host/   Headless Effect application, Host Protocol, SQLite, Projects, Sessions, Git

packages/
  host-contracts/   Browser-safe Effect Schemas and HttpApi declarations
  client-runtime/   Browser-safe Host client and in-memory projections
  pi-adapter/       Host-side Effect boundary around Pi

docs/               TStack docs, ADRs, and engineering doctrine
.agents/             TStack skills and prompts
scripts/             Repository and release helpers
```

`apps/handbook` and `packages/ui` remain inactive placeholders until a concrete delivery slice needs them. Do not add speculative packages or empty architecture folders.

Follow `docs/feature-architecture.md` for internal feature placement, naming, and import direction.

## Runtime Responsibilities

### Electron Desktop main

Electron main owns only Desktop-native and trusted local-supervisor behavior, including:

- application lifecycle, windows, menus, native dialogs, and updates;
- secure preload APIs and Desktop-only IPC handlers;
- Local Host child-process launch, monitoring, crash restart, and orderly shutdown;
- protected one-time bootstrap communication;
- the Host-lifetime supervisor capability; and
- minting or renewing short-lived renderer client capabilities through the Host.

Electron main does not own the Project catalog, Project Session domain, Pi execution, Session worktrees, Session Git operations, or Host SQLite database.

### Desktop preload

Preload is a narrow typed bridge for Desktop-native operations and Local Host connection/capability delivery. It contains no product business rules, Project/Session persistence, Git policy, Pi behavior, or supervisor credential exposure.

### React renderer

The renderer owns presentation and browser-safe interaction only. It may use Client Runtime for Host commands, queries, subscriptions, and projections. It may hold a short-lived scoped client capability in memory, but never bootstrap or supervisor authority.

Renderer code must not receive raw Node.js, Electron, filesystem, shell, database, Git, Pi, or credential-store access. React and generic UI components remain Effect-free and consume plain immutable projections, explicit states, and callbacks.

### Workspace Host

Workspace Host owns:

- authenticated HTTP/JSON commands and queries and authenticated SSE;
- the Host-local Project catalog;
- Project Session application behavior and event-sourced persistence;
- Pi execution through Pi Adapter;
- managed worktree and Session Git lifecycle;
- Workspace Tools and Host-side process execution;
- recovery, reconciliation, and durable client projections; and
- the private Host SQLite database and migrations.

### Host Contracts

`packages/host-contracts` owns browser-safe Effect Schemas, HttpApi declarations, stable wire models, commands, queries, events, projections, and public errors. It must not depend on Electron, React, Pi, Node filesystem/process APIs, or persistence implementations.

Wire values remain plain interoperable HTTP/JSON/SSE. Do not serialize Effect runtime internals, Pi SDK events, database rows, or Electron types.

### Client Runtime

`packages/client-runtime` owns browser-safe Effect HttpApi Client behavior, authenticated streaming `fetch()`, reconnect/cursor logic, capability lifecycle, and in-memory projections. Effect and unstable HTTP types remain internal; UI consumers receive plain values and callbacks.

### Pi Adapter

`packages/pi-adapter` owns Pi SDK integration, Pi authentication storage access, conversation/resource setup, event translation, cancellation, and cleanup. Pi types and transcript formats do not escape into Host Contracts or UI.

## Dependency Direction

Preserve this direction:

```txt
apps/desktop
  -> packages/client-runtime
  -> packages/host-contracts

apps/workspace-host
  -> packages/host-contracts
  -> packages/pi-adapter

packages/pi-adapter
  -> Pi SDK
```

Rules:

- packages never depend on applications;
- applications never import another application's source;
- consume workspace packages through declared package exports, not deep source imports;
- Client Runtime remains browser-safe;
- Pi Adapter remains Host-side;
- Host Contracts remain browser-safe and infrastructure-independent; and
- Desktop and Workspace Host may share protocol contracts, not application internals.

## Communication Boundaries

### Host Protocol

Host-owned product behavior uses Client Runtime over authenticated HTTP/JSON and SSE, not Electron IPC.

- Commands include stable command IDs where retry/idempotency requires them.
- Prompt admission is acknowledged separately from completion of the agent turn.
- Durable events commit before publication.
- Queries state the projection sequence/cursor they include.
- SSE uses `Authorization` headers through streaming `fetch()`, ordered event IDs, reconnect, and cursor catch-up.
- Every useful operation validates capability audience, expiry, scope, origin, and operation authorization.
- Public errors use stable schemas and do not expose internal exceptions, secrets, paths, or Effect causes.

### Desktop IPC

Use preload/IPC only for Electron-native behavior such as native dialogs, window controls, updates, deep links, Local Host connection bootstrap, and client-capability renewal.

- Expose narrow methods through `contextBridge`.
- Keep payloads serializable and minimal.
- Validate untrusted inputs in Electron main before native operations.
- Never expose raw `ipcRenderer`, arbitrary channels, supervisor credentials, filesystem handles, or command execution.
- Do not proxy ordinary Host commands through Electron main.

## Security Rules

Preserve secure Electron defaults unless an active ADR explicitly changes them:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: join(__dirname, '../preload/index.mjs')
}
```

Rules:

- Do not enable renderer Node integration.
- Public builds disable unnecessary Electron Node-mode, Node-options, and inspect-argument fuses.
- Do not use `ELECTRON_RUN_AS_NODE` or Electron `utilityProcess` for the Local Host.
- Pass Local Host bootstrap material only through a protected inherited process channel, never arguments, environment variables, URLs, logs, files, or renderer IPC.
- Electron main alone holds the supervisor capability.
- Renderer client capabilities are short-lived, scoped, memory-only, and renewed through preload.
- Bind the initial Host to loopback, restrict origins explicitly, and authenticate every useful endpoint and SSE subscription.
- Treat renderer inputs, agent output, project files, diffs, Markdown, and embedded web content as untrusted.
- Open external links through a validated native policy and deny uncontrolled windows or redirects.
- Keep secrets out of source, URLs, logs, telemetry, Session events, transcripts, worktrees, Git, ordinary process environments, and persistent renderer state.

## Effect Rules

Use exact-pinned Effect `4.0.0-rc.109` and matching ecosystem packages across Host Contracts, Workspace Host, Pi Adapter, Client Runtime, and Effect test utilities.

- Keep TypeScript strict.
- Use Effect Schema at Host Protocol and durable-event boundaries.
- Model expected failures with typed errors rather than defects or untyped exceptions.
- Use services/Layers for runtime capabilities and test seams.
- Use scopes and structured concurrency for servers, subscriptions, Pi sessions, and child resources.
- Keep unstable HTTP, HttpApi, and SQL types behind Space Zero-owned adapters.
- Never require React components or generic UI helpers to construct or interpret Effects, Layers, Streams, or HttpApi types.
- Upgrade Effect only through one workspace-wide, fully validated dependency change.

## SQLite and Durable Data

The Local Host owns one private SQLite database under operating-system application data. It uses Effect `@effect/sql-sqlite-node` over private Node `22.23.1`'s built-in `node:sqlite`.

- Enable foreign keys and WAL.
- Use numbered transactional migrations.
- Keep database initialization, migration, and adapter code inside Workspace Host.
- Project Session events are authoritative; relational Session projections are rebuildable.
- Project catalog records are conventional Host-owned relational data.
- Use command receipts for retryable/idempotent mutations.
- Commit durable events and projections atomically before publishing events.
- Use real SQLite for migration, constraint, transaction, projection rebuild, backup, and restart tests.
- Keep synchronous transactions short and measure event-loop delay and contention.
- Never place SQLite files in Space Zero Home, Project repositories, or Session worktrees.
- Do not mirror Pi credentials, Pi transcripts, Git contents, filesystem contents, or Desktop-local UI state into the Host database.
- Desktop must not duplicate Host-owned Project or Session persistence.

## Project Session and Workspace Safety

- Every initial Project Session requires a Git repository with a valid committed `HEAD`.
- One Project Session owns one Pi conversation, Session event stream, managed branch/worktree, and focused workflow.
- Create worktrees only under `<Space Zero Home>/worktrees/<project-id>/<session-id>/`.
- Persist and authenticate repository, worktree, branch, Project, Session, and starting-revision identity.
- Never fall back to running a Project Session in the registered base checkout.
- Treat provisioning and cleanup as durable recoverable lifecycles.
- Never automatically replay a turn or external side effect whose completion is ambiguous after a crash.
- Destructive cleanup must fail closed when worktree identity cannot be proven.

## React and UI Conventions

- Use React and TypeScript for renderer UI.
- Use Tailwind CSS utilities and shadcn/ui-compatible primitives.
- Keep design-system primitives domain-free.
- Keep presentational views independent from Client Runtime, preload, routing, and app-global side effects where practical; connect them through containers/hooks.
- Prefer accessible controls and labels for icon-only actions.
- Use `-webkit-app-region: drag` only for titlebar drag regions and opt interactive children out.
- Keep user-facing terms aligned with `docs/context.md`.
- Visual fixtures and Storybook stories use plain props rather than mocking the entire runtime.

## TypeScript, Naming, and Imports

- Use strict ESM TypeScript.
- Use kebab-case files and folders.
- Use role suffixes where they clarify architecture: `.service.ts`, `.model.ts`, `.schema.ts`, `.contract.ts`, `.repository.ts`, `.adapter.ts`, `.http.ts`, `.ipc.ts`, `.projector.ts`.
- Keep imports organized by Node/Electron, third-party, workspace package, then local modules.
- Do not create barrels that combine incompatible runtime surfaces.
- Do not import application source across `apps/*`.
- Do not deep-import another workspace package's `src` tree.
- Do not import Node/Electron/Host-only modules into browser-safe packages or renderer code.
- Prefer explicit exports and public types at package and process boundaries.

## Testing Standards

Follow ADR 0036 and `docs/engineering/testing.md`.

- Use Vitest with Node environments for Host/packages/Electron main and jsdom with Testing Library for React.
- Use Effect test utilities for Layers, scopes, clocks, retries, interruption, and cleanup.
- Test Workspace Host headlessly through real HTTP/SSE, real `node:sqlite`, and temporary Git repositories/worktrees.
- Replace Pi at Pi Adapter for deterministic domain tests; keep a narrow no-paid-call real-Pi compatibility suite.
- Run broad Electron screen, navigation, accessibility, and screenshot E2E against a deterministic contract-compatible mock Host over real HTTP/SSE.
- Keep a smaller real-Host Electron suite for bootstrap, capability delivery, connection, crash restart, native integration, and quit behavior.
- Use packaged smoke tests for private Node, built-in SQLite, Host assets, fuses, architecture, startup, and signing layout.
- Prefer public behavior and outcomes over private call order.
- Add regression coverage for bugs when practical.

## Dependency Policy

- Use existing dependencies and platform capabilities by default.
- Ask before adding a runtime dependency or major abstraction.
- Explain maintenance, security, bundle, and supply-chain cost when adding a dependency.
- Pin Effect ecosystem packages exactly and coherently.
- Be especially careful with native dependencies because they affect runtime ABI, packaging, signing, and cross-platform distribution.
- Do not add Nx, Turborepo, another HTTP framework, another schema runtime, or speculative packages without a new demonstrated need and approval.

## ADR Triggers

Create or update an ADR when changing decisions around:

- Desktop/Workspace Host ownership or process boundaries;
- preload/IPC or Host Protocol shape and security;
- capability, credential, or secret ownership;
- Project, Session, workspace, Git, or Pi ownership;
- persistence, event sourcing, migrations, or recovery;
- package dependency direction or runtime packaging;
- major framework/runtime dependencies;
- Remote Host, Remote Access, or Handoff architecture;
- signing, updates, or release distribution; or
- major testing strategy.

Do not create ADRs for routine styling, focused bug fixes, or temporary implementation details.
