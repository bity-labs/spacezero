---
title: Space Zero Feature Architecture
---

# Space Zero Feature Architecture

## Purpose

Use this file before adding, moving, or reorganizing Space Zero feature source.

Space Zero is a pnpm monorepo containing independently runnable Desktop and Workspace Host applications plus explicit shared packages. Organize by deployable runtime first, then by product feature inside that runtime. Runtime and package boundaries are security and deployment boundaries, not naming preferences.

## Core Rule

```text
Choose the owning runtime or package first.
Then organize related behavior by feature inside that boundary.
Share contracts, not application internals.
```

Do not restore the archived v0 repository-root `src/main`, `src/preload`, `src/renderer`, and `src/features/{feature}/{main,renderer,shared}` architecture. Desktop may use main/preload/renderer folders internally, but Workspace Host behavior never moves into Desktop merely because a renderer needs it.

## Top-Level Architecture

```txt
apps/
  desktop/          Electron shell, React client, native integration, Local Host supervision
  workspace-host/   Headless Effect application, Host Protocol, SQLite, Projects, Sessions, Git
  handbook/         Private Fumadocs engineering handbook for human build memory

packages/
  host-contracts/   Browser-safe Effect Schemas and HttpApi declarations
  client-runtime/   Browser-safe Host client and in-memory projections
  pi-adapter/       Host-side Effect boundary around Pi
  ui/               Browser-safe React UI primitives, theme tokens, and Storybook
```

`apps/handbook` is active as a private Fumadocs handbook. `packages/ui` is active as the browser-safe React UI package for domain-free shadcn-compatible primitives, theme tokens, and Storybook visual contracts. Do not create future applications, domain packages, infrastructure packages, or empty feature folders speculatively.

## Dependency Graph

```text
apps/desktop
  -> packages/client-runtime
  -> packages/host-contracts
  -> packages/ui

apps/workspace-host
  -> packages/host-contracts
  -> packages/pi-adapter

packages/pi-adapter
  -> Pi SDK
```

Rules:

- packages never depend on applications;
- applications never import another application's source;
- workspace packages are consumed through declared exports, not deep `src` imports;
- Host Contracts do not depend on Electron, React, Pi, Node filesystem/process APIs, database drivers, or Host implementation modules;
- Client Runtime remains browser-safe and does not depend on Electron, Pi, SQLite, Git, or Workspace Host source;
- Pi Adapter remains Host-side and does not depend on Desktop, React, or Client Runtime;
- Electron-native behavior remains inside Desktop;
- Project catalog, Session domain, Pi execution, worktrees, Session Git, and Host persistence remain inside Workspace Host or Pi Adapter; and
- React and generic UI consume plain Client Runtime values rather than Host services or Effect runtime types.

## Application and Package Responsibilities

### `apps/desktop`

Desktop contains three internal runtime surfaces:

```txt
apps/desktop/src/
  main/       Electron lifecycle, windows, native adapters, Local Host supervisor
  preload/    Narrow typed bridge for Desktop-native behavior and client capability delivery
  renderer/   React application, containers, views, and browser-safe interaction
```

Create this structure only when implementation begins; subfolders should follow present behavior rather than an exhaustive future tree.

#### Desktop main owns

- Electron application and window lifecycle;
- menus, native dialogs, deep links, updates, and other native UI integration;
- Local Host child-process launch, protected bootstrap, monitoring, restart, and shutdown;
- the supervisor capability; and
- narrow Desktop-only IPC handlers and client-capability issuance/renewal through preload.

Desktop main does not own Host Projects, Project Sessions, Pi, managed worktrees, Session Git operations, Workspace Tools, or the Host database.

#### Desktop preload owns

- the smallest typed `window.spacezero` surface needed for Desktop-native operations;
- Local Host endpoint/instance information delivery; and
- short-lived client capability delivery and renewal requests.

Preload contains no product business rules, Host persistence, filesystem policy, Git policy, Pi behavior, or supervisor authority.

#### Desktop renderer owns

- React screens, layouts, containers, and presentational views;
- browser-safe feature hooks and interaction state;
- Client Runtime construction and plain projection consumption at application boundaries;
- renderer-local navigation, selection, ephemeral input, and layout behavior; and
- Desktop-native calls through preload when a use case actually belongs to Electron.

The renderer never imports Electron, Node.js, Workspace Host source, Pi, SQLite, Git/process adapters, or secret stores. It may hold only a short-lived scoped Host client capability in memory.

### `apps/handbook`

Handbook is a private Fumadocs/Next.js application for human-oriented build memory. It owns explanatory documentation, implementation walkthroughs, operating notes, and status summaries for the product owner.

Handbook may summarize and link to repository docs, ADRs, PRDs, and issue plans, but it must not redefine normative architecture, coding standards, security rules, or accepted decisions differently from `docs/`. When a durable rule changes, update the normative source first and then update Handbook with the practical explanation.

Handbook does not own product runtime behavior, Host Protocol contracts, Electron behavior, Project Session state, Git policy, Pi behavior, credentials, or shared UI packages.

### `apps/workspace-host`

Workspace Host is one headless Node/Effect runtime. It owns:

- Effect HttpApi server handlers and authenticated typed SSE;
- capability authorization and origin enforcement;
- Host-local Project catalog and repository authentication;
- event-sourced Project Session behavior and projections;
- Pi coordination through Pi Adapter;
- managed worktree and Session Git lifecycle;
- Workspace Tools and Host-owned child processes;
- recovery and reconciliation; and
- SQLite initialization, migrations, repositories, event journal, projectors, and command receipts.

Organize Host source by current feature when a feature has multiple related files. Keep the composition root and truly cross-feature infrastructure outside feature modules.

Illustrative structure, not a requirement to create every folder:

```txt
apps/workspace-host/src/
  main.ts
  runtime/                         # composition root and cross-feature Host adapters
  features/
    projects/
      projects.service.ts
      projects.repository.ts
      projects.http.ts
    project-sessions/
      project-session.service.ts
      project-session.repository.ts
      project-session.projector.ts
      project-session.http.ts
```

Keep application policy in services, persistence mechanics in repositories, HTTP translation in `.http.ts` adapters, and external mechanics in focused adapters. Do not let HttpApi requests, database rows, Git command results, or Pi SDK types become domain models.

### `packages/host-contracts`

Host Contracts owns browser-safe, versioned protocol definitions:

- Effect Schemas for identifiers, commands, queries, events, projections, and public errors;
- HttpApi groups/endpoints and authorization declarations;
- SSE event envelopes and cursor-compatible wire types;
- protocol/compatibility metadata; and
- derived OpenAPI generation inputs.

Illustrative grouping:

```txt
packages/host-contracts/src/
  protocol/
  projects/
  project-sessions/
```

Contracts use plain interoperable HTTP/JSON/SSE encodings. Never expose Effect `Cause`, `Exit`, Layer, fiber, internal branded values, Pi events, Electron types, database rows, or filesystem handles.

### `packages/client-runtime`

Client Runtime owns browser-safe Host client behavior:

- Effect HttpApi Client and fetch-based HTTP implementation;
- Authorization headers and client-capability lifecycle;
- streaming SSE decoding, cursor catch-up, reconnect, cancellation, and cleanup;
- command dispatch and stable public error mapping; and
- in-memory client projections and framework-neutral subscriptions.

Illustrative grouping:

```txt
packages/client-runtime/src/
  connection/
  projects/
  project-sessions/
```

Unstable Effect HTTP types remain internal. Public package exports intended for UI use expose plain values, explicit states, subscriptions, and callbacks.

### `packages/ui`

UI owns domain-free browser-safe React presentation code:

- shadcn-compatible primitives such as `Button`, `Input`, and `Dialog`;
- the canonical Space Zero Tailwind CSS v4 theme tokens from the approved shadcn preset;
- shared composed visual components when reuse is demonstrated; and
- high-fidelity mock screens used as visual contracts for agents and product iteration.

UI may depend on React as peer/dev tooling and ordinary browser-safe UI libraries. It must not depend on Electron, preload APIs, Client Runtime, Host Contracts, Effect, Pi, SQLite, Node filesystem/process APIs, application source, or product runtime state.

### `packages/pi-adapter`

Pi Adapter owns all Pi implementation detail:

- Pi SDK session and conversation construction;
- Host-global Pi authentication storage;
- approved resource/tool configuration;
- Pi event translation into Host-facing values;
- cancellation, interruption, restore, and cleanup; and
- focused compatibility seams for tests.

Illustrative grouping:

```txt
packages/pi-adapter/src/
  authentication/
  conversations/
  resources/
```

Pi types, auth file formats, and transcript formats never become Host wire contracts. Pi Adapter does not own Space Zero Session history or client projections.

## Feature Placement Rules

### Choose the authority, not the caller

A renderer button does not make behavior renderer-owned. Place behavior where its authority lives:

- UI presentation or local selection → Desktop renderer;
- native folder picker or window action → Desktop main via preload;
- Project registration or Session creation → Workspace Host via Client Runtime;
- worktree, Git, SQLite, or agent action → Workspace Host;
- Pi-specific mechanism → Pi Adapter;
- shared wire shape → Host Contracts; and
- reconnect/projection client behavior → Client Runtime.

### Keep feature code local to its runtime

A feature may have related code in multiple runtimes without sharing one cross-runtime feature folder. For example, Projects can have:

```txt
apps/desktop/src/renderer/features/projects/
apps/workspace-host/src/features/projects/
packages/host-contracts/src/projects/
packages/client-runtime/src/projects/
```

These are separate runtime modules connected by package contracts. Do not create a repository-root `features/projects` barrel that re-exports all of them.

### Add only current surfaces

Add a feature folder when the current slice has multiple related files or needs a clear public boundary. A single focused adapter or component may remain near its composition root until feature grouping reduces actual complexity.

A new package requires a second concrete consumer or a deployment/testing boundary that materially reduces coupling. Do not create `session-domain`, `git-core`, `shared-utils`, or similar packages solely to complete a diagram.

## Desktop UI Placement

All renderer paths below are relative to `apps/desktop/src/renderer`.

### Generic UI primitives

```txt
components/ui/
```

Examples: `button.tsx`, `card.tsx`, `input.tsx`, `dialog.tsx`, `tabs.tsx`.

New shared primitives live in `packages/ui/src/components/ui/` and are consumed through `@spacezero/ui` once the Desktop renderer needs them. Desktop-local primitives may remain under the renderer until they are migrated or generalized.

Primitives are domain-free and Effect-free. They do not know about Projects, Sessions, agents, GitHub, Host connections, Client Runtime, preload, routing, or persistence.

### Generic composed components

```txt
components/
```

Use for reusable renderer composition such as app shell, titlebar, resizable panels, and keyboard shortcut presentation. Low-level design-system `Empty` primitives remain under `components/ui`; feature-specific empty/loading presentations stay with their feature.

### Feature-specific UI

```txt
features/{feature-name}/components/
features/{feature-name}/hooks/
features/{feature-name}/lib/
```

If a component or hook uses feature language, feature models, Host projections, or feature-specific actions, keep it with that renderer feature.

### Views and containers

Prefer a pure view/container split when runtime wiring would otherwise make presentation hard to test or render:

- views accept plain props and emit callbacks;
- containers/hooks consume Client Runtime, preload, routing, or application context; and
- Storybook and visual fixtures render views with plain deterministic data.

Do not make every trivial component use two files; apply the split when it protects reuse, testing, or runtime boundaries.

## Communication Flows

### Host-owned product behavior

```text
Renderer feature container
  -> Client Runtime plain command/query API
  -> Effect HttpApi Client / authenticated HTTP or SSE
  -> Workspace Host HttpApi adapter
  -> Host application service
  -> repository / Git / worktree / Pi adapter
  -> SQLite, filesystem, Git, process, or Pi
```

Example Project list placement:

```txt
apps/desktop/src/renderer/features/projects/
packages/client-runtime/src/projects/
packages/host-contracts/src/projects/
apps/workspace-host/src/features/projects/
```

Electron main is not a proxy in this flow.

### Desktop-native behavior

```text
Renderer container
  -> window.spacezero native method
  -> preload bridge
  -> Electron main IPC handler
  -> native Desktop adapter
```

Examples include folder selection, window controls, update actions, opening a validated external URL, and requesting a renewed client capability.

IPC handlers must not become alternate implementations of Host Project, Session, Git, or Pi behavior.

### Agent Workspace Tool behavior

```text
Pi conversation
  -> Pi Adapter custom tool boundary
  -> Workspace Host Workspace Tool registry/policy
  -> the same Host application service used by Host Protocol handlers
  -> authorized Host adapter
```

Agents do not receive direct SQLite access, arbitrary Host internals, renderer automation backdoors, or unverified filesystem authority.

## File Naming

Use kebab-case files and folders. Use dot suffixes when they communicate an architectural role.

| Suffix                   | Use                                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| `.model.ts`              | Internal product/domain values when a separate model file helps.             |
| `.schema.ts`             | Effect Schema and validation definitions.                                    |
| `.contract.ts`           | Stable package or module contract not already expressed directly by HttpApi. |
| `.service.ts`            | Application/use-case behavior and orchestration.                             |
| `.repository.ts`         | Persistence port/implementation local to Workspace Host.                     |
| `.adapter.ts`            | External runtime, provider, filesystem, Git, process, or native adapter.     |
| `.http.ts`               | Workspace Host HttpApi handler/transport adapter.                            |
| `.ipc.ts`                | Desktop-native Electron IPC only.                                            |
| `.projector.ts`          | Deterministic Session event projection behavior.                             |
| `.test.ts` / `.test.tsx` | Unit, integration, or renderer component test.                               |

Use names that describe the behavior hidden by the file. Do not use `.shared.ts` as a substitute for deciding package and runtime ownership.

## Import Rules

### Allowed

```text
apps/desktop renderer       -> packages/client-runtime public exports
apps/desktop renderer       -> packages/ui public exports for shared primitives and visual components
apps/desktop                -> packages/host-contracts public exports when genuinely needed
apps/workspace-host         -> packages/host-contracts public exports
apps/workspace-host         -> packages/pi-adapter public exports
packages/client-runtime     -> packages/host-contracts public exports
packages/pi-adapter         -> Pi SDK
same runtime feature        -> another feature's explicit runtime-local public API
```

### Forbidden

```text
any package                 -> apps/**
apps/desktop                -> apps/workspace-host/src/**
apps/workspace-host         -> apps/desktop/src/**
renderer or browser package -> Electron, Node filesystem/process, SQLite, Pi, Host adapters
packages/host-contracts     -> React, Electron, Node, Pi, SQLite, Git, persistence
packages/pi-adapter         -> Desktop, React, Client Runtime
any workspace consumer      -> another package's undeclared src/** path
React/generic UI            -> Effect HttpApi, Layer, Stream, or Host service internals
```

Avoid deep cross-feature imports. If one feature needs another feature's behavior, use the owning runtime's small public service/interface or a focused orchestrator. Do not create a generic utility package to hide unclear ownership.

## Runtime and Infrastructure Containment

- Effect HttpApi declarations live in Host Contracts; HttpApi server handlers and Node HTTP server runtime code stay in Workspace Host transport adapters.
- Effect HttpApi Client and fetch transport stay inside Client Runtime.
- Effect SQL and `node:sqlite` stay inside Workspace Host persistence adapters.
- Pi SDK and Pi authentication storage stay inside Pi Adapter.
- Electron APIs stay inside Desktop main/preload, except renderer-safe types explicitly defined by Desktop.
- React stays inside Desktop renderer or a deliberately activated UI package.
- Git and filesystem adapters return Space Zero values and typed failures, not raw process output.

## Testing Placement

Co-locate focused tests with the module when that improves discoverability. Keep cross-runtime suites in explicit test areas owned by the relevant application/package.

- Host Contracts: schema, wire compatibility, public error, and OpenAPI generation tests.
- Client Runtime: authentication, decoding, reconnect, cursor, projection, and cancellation tests.
- Workspace Host: headless real HTTP/SSE, real `node:sqlite`, event replay, migration, Git/worktree, recovery, and Pi Adapter integration tests.
- Desktop renderer: Vitest/jsdom component and container tests.
- Desktop mock-Host E2E: broad screen, navigation, accessibility, state, and screenshot coverage through real HTTP/SSE.
- Desktop real-Host E2E: narrow bootstrap, capability, connection, restart, native integration, and quit coverage.
- Packaged tests: private Node, built-in SQLite, Host payload, Electron fuses, architecture, startup, and signing layout.

Test-only Host launch injection must be explicit and fail closed or be absent from production builds. Mock Host scenarios conform to Host Contracts rather than replacing product behavior through IPC patches.

## Decision Checklist

Before placing a file, ask:

1. Which deployable runtime or package owns this behavior?
2. Is this UI, client transport/projection, wire contract, Host application policy, Pi integration, persistence, or native Desktop behavior?
3. Does authority live with Electron, Workspace Host, Pi, or the client?
4. Is the proposed dependency direction allowed?
5. Am I sharing a stable contract or leaking another application's implementation?
6. Can React receive plain values instead of Effect/Host internals?
7. Does this feature need multiple files now, or would a focused local module be clearer?
8. Does a new package have a second concrete consumer or deployment boundary?
9. Do security, persistence, packaging, or protocol implications require an ADR update?

## Active ADR Basis

This guide implements the active architecture decisions, especially:

- ADR 0025 — separate Workspace Host and Desktop-managed Local Host lifecycle;
- ADR 0026 — HTTP/JSON and authenticated SSE Host Protocol;
- ADR 0027 — Effect 4 across Host architecture, not React/generic UI;
- ADR 0028 — Host-owned SQLite and event-sourced Project Sessions;
- ADR 0029 — one isolated worktree/conversation per initial Project Session;
- ADR 0030 — pnpm monorepo and explicit runtime packages;
- ADR 0032 — bootstrap, supervisor, and client capabilities;
- ADR 0034 — Host-owned Project catalog;
- ADR 0036 — Host, mock-Host Electron, real-Host Electron, and packaged tests; and
- ADR 0037 — Effect HttpApi and HTTP Client implementation.

Archived v0 ADRs are historical context only and are not normative for new source placement.
