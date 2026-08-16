---
title: Space Zero Feature Architecture
---

# Space Zero Feature Architecture

## Purpose

Use this file when adding, moving, or reorganizing Space Zero source code by product feature.

Space Zero uses Electron, so feature architecture must be **process-aware**. Feature code may be grouped by product concept, but privileged main-process code, renderer UI code, preload bridge code, and shared contracts must stay separated.

## Core Rule

Organize by feature **inside explicit runtime boundaries**.

```txt
src/features/{feature-name}/
├── main/      # Electron main-process feature implementation
├── renderer/  # React renderer feature UI, hooks, and renderer helpers
└── shared/    # Serializable feature contracts, schemas, constants, and types
```

Create only the folders a feature needs. A renderer-only UI feature may not need `main`. A main-only infrastructure capability may not need `renderer`.

Do not create a root feature barrel that exports every runtime surface together.

Bad:

```txt
src/features/projects/index.ts
```

```ts
export * from './main'
export * from './renderer'
export * from './shared'
```

Good:

```txt
src/features/projects/main/index.ts
src/features/projects/renderer/index.ts
src/features/projects/shared/index.ts
```

Each runtime imports the subpath it is allowed to use.

## Runtime Responsibilities

### `features/{feature}/main`

Main-process feature code owns privileged behavior:

- Electron `ipcMain` handlers
- SQLite reads/writes through main-owned database modules
- filesystem access
- child processes
- Git CLI work
- GitHub API access and credentials
- agent/session orchestration
- application/use-case services
- repositories/adapters for main-process infrastructure

Example:

```txt
src/features/projects/main/
├── index.ts
├── projects.ipc.ts
├── projects.repository.ts
└── projects.service.ts
```

### `features/{feature}/renderer`

Renderer feature code owns UI and browser-safe client behavior:

- feature-specific React components
- feature-specific React hooks
- feature-specific renderer helpers
- feature-specific state and presentation logic
- calls to `window.spacezero.*` through hooks or small renderer clients

Example:

```txt
src/features/projects/renderer/
├── index.ts
├── components/
│   ├── project-card.tsx
│   └── project-list.tsx
├── hooks/
│   └── use-projects.ts
└── lib/
    └── project-display.ts
```

Renderer feature code must not import main-process modules, Electron APIs, Node.js APIs, SQLite clients, filesystem helpers, credentials, or child-process helpers.

### `features/{feature}/shared`

Shared feature code owns serializable cross-process contracts:

- IPC channel names for that feature
- request/response types
- Zod schemas for IPC inputs
- serializable domain models used across runtime boundaries
- constants that do not depend on a runtime

Example:

```txt
src/features/projects/shared/
├── index.ts
├── project.model.ts
├── projects.contract.ts
└── projects.schema.ts
```

Shared feature code must not import React, renderer components, Electron main APIs, Node.js modules, SQLite clients, filesystem helpers, credentials, or process-specific utilities.

## Global Runtime Folders

Process entrypoints and reusable runtime-specific infrastructure remain outside feature modules.

```txt
src/main/       # Electron app lifecycle, windows, database base, global main utilities
src/preload/    # Safe typed bridge exposed as window.spacezero
src/renderer/   # React app entrypoint, global renderer UI, styles, renderer utilities
src/shared/     # App-wide serializable contracts and cross-process types
src/features/   # Product features split by runtime
```

Use global folders for infrastructure or reusable code that is not owned by one feature.

## UI Placement Rules

### Generic UI primitives

Design-system-level primitives go in:

```txt
src/renderer/src/components/ui/
```

Examples:

```txt
button.tsx
card.tsx
label.tsx
input.tsx
dialog.tsx
tabs.tsx
```

These components should be domain-free. They should not know about projects, sessions, agents, GitHub, SQLite, IPC, or Space Zero workflows.

### Generic composed renderer components

Reusable renderer components built from UI primitives go in:

```txt
src/renderer/src/components/
```

Examples:

```txt
app-shell/app-titlebar.tsx
app-shell/resizable-panel.tsx
empty-state.tsx
loading-state.tsx
keyboard-shortcut.tsx
```

Use this folder when a component can be reused across features without knowing one feature's domain.

### Feature-specific components

Feature-specific components go in:

```txt
src/features/{feature}/renderer/components/
```

Examples:

```txt
src/features/projects/renderer/components/project-card.tsx
src/features/sessions/renderer/components/session-output.tsx
src/features/github/renderer/components/pull-request-card.tsx
```

If a component uses feature language or feature-specific models, keep it inside that feature even if it is visually reusable.

## Library and Hook Placement Rules

The same global-versus-feature rule applies to helpers, hooks, services, and adapters, but always choose the runtime first.

### Renderer reusable helpers

```txt
src/renderer/src/lib/
src/renderer/src/hooks/
```

Examples:

```txt
src/renderer/src/lib/utils.ts
src/renderer/src/lib/format-date.ts
src/renderer/src/hooks/use-color-mode.ts
src/renderer/src/hooks/use-keyboard-shortcut.ts
```

These may use browser-safe APIs and renderer dependencies.

### Feature renderer helpers

```txt
src/features/{feature}/renderer/lib/
src/features/{feature}/renderer/hooks/
```

Examples:

```txt
src/features/projects/renderer/lib/project-display.ts
src/features/projects/renderer/hooks/use-projects.ts
```

### Main reusable helpers

```txt
src/main/lib/
```

Examples:

```txt
logger.ts
app-paths.ts
safe-path.ts
safe-shell.ts
```

These may use Electron main APIs or Node.js APIs. They must not be imported by renderer code.

### Feature main services and adapters

```txt
src/features/{feature}/main/
```

Recommended roles:

```txt
{feature}.ipc.ts          # ipcMain handlers for the feature
{feature}.service.ts      # application/use-case logic
{feature}.repository.ts   # SQLite persistence for the feature
{feature}.adapter.ts      # external-system adapter when needed
```

Prefer placing application services in the main feature folder because Space Zero's privileged product behavior belongs behind IPC, not in the renderer.

## File Naming Rules

Use **kebab-case** file and folder names.

Use dot suffixes for file roles when the suffix communicates architecture.

Examples:

```txt
project.model.ts
projects.schema.ts
projects.contract.ts
projects.service.ts
projects.repository.ts
projects.ipc.ts
project-card.tsx
project-list.tsx
use-projects.ts
```

Common suffixes:

| Suffix                   | Use                                                                           |
| ------------------------ | ----------------------------------------------------------------------------- |
| `.model.ts`              | Domain types and serializable models.                                         |
| `.schema.ts`             | Zod validation schemas.                                                       |
| `.contract.ts`           | IPC channels, request/response contracts, and API surface types.              |
| `.service.ts`            | Main-process application/use-case logic.                                      |
| `.repository.ts`         | Persistence access, usually SQLite through main-process database modules.     |
| `.adapter.ts`            | External provider or system adapter.                                          |
| `.ipc.ts`                | Electron `ipcMain` handler registration.                                      |
| `.query.ts`              | Reserved for explicit query/read patterns once the project standardizes them. |
| `.test.ts` / `.test.tsx` | Unit or component tests.                                                      |

Use singular names when the file models one concept:

```txt
project.model.ts
project-card.tsx
```

Use plural names when the file manages a feature collection or capability surface:

```txt
projects.service.ts
projects.repository.ts
projects.ipc.ts
```

## Import Rules

Allowed:

```txt
src/main/**                         -> src/features/*/main/**
src/main/**                         -> src/features/*/shared/**
src/preload/**                      -> src/features/*/shared/**
src/renderer/**                     -> src/features/*/renderer/**
src/renderer/**                     -> src/features/*/shared/**
src/features/{feature}/main/**      -> src/features/{feature}/shared/**
src/features/{feature}/renderer/**  -> src/features/{feature}/shared/**
```

Forbidden:

```txt
src/renderer/**                     -> src/main/**
src/renderer/**                     -> src/features/*/main/**
src/renderer/**                     -> electron, node:fs, node:path, child_process, better-sqlite3
src/features/*/shared/**            -> React or renderer components
src/features/*/shared/**            -> Electron, Node.js, SQLite, filesystem, child processes
```

Avoid deep cross-feature imports. If one feature needs another feature's behavior, import from the other feature's runtime-specific public API or introduce a small orchestrator at the appropriate runtime boundary.

## IPC Feature Flow

A typical feature read flow should look like this:

```txt
Feature renderer component
  -> feature renderer hook/client
  -> window.spacezero.{feature}.{method}()
  -> preload bridge
  -> feature main IPC handler
  -> feature main service
  -> feature main repository/adapter
  -> SQLite, filesystem, Git, GitHub, or agent process
```

Example for projects:

```txt
src/features/projects/renderer/components/project-list.tsx
src/features/projects/renderer/hooks/use-projects.ts
src/preload/index.ts
src/features/projects/main/projects.ipc.ts
src/features/projects/main/projects.service.ts
src/features/projects/main/projects.repository.ts
src/main/db/
```

## Preload Rules

Preload remains a thin bridge only.

It may import shared contracts and expose narrow methods through `contextBridge.exposeInMainWorld('spacezero', api)`, but it should not contain business logic, persistence logic, filesystem operations, Git operations, agent orchestration, credentials, or database clients.

## Query Files

The `.query.ts` suffix is intentionally reserved. In Next.js projects, a query file often wraps server-side data fetching. In Space Zero, reads cross the Electron IPC boundary, so the team should define this pattern deliberately before using it widely.

Until then, prefer:

- renderer hooks or small renderer clients for UI reads,
- main services for application read logic,
- repositories for persistence reads,
- IPC contracts for cross-process read shapes.

## When to Add a New Feature Module

Add a feature module when a product concept has, or is expected to have, behavior across multiple files or runtime surfaces.

Likely feature modules for Space Zero include:

```txt
projects
sessions
workspace
agents
github
preview
settings
knowledge
```

Do not introduce empty architecture folders ahead of need. Create the smallest runtime surfaces needed for the current change.

## Decision Checklist

Before placing a new file, ask:

1. Which runtime owns this code: main, preload, renderer, or shared?
2. Is this owned by one feature, or reusable across many features?
3. Does it import privileged APIs? If yes, it cannot be renderer or shared.
4. Does it import React or browser UI code? If yes, it cannot be main or shared.
5. Is it serializable contract/type/schema code only? If yes, it may belong in shared.
6. Can another feature reuse it without understanding this feature? If yes, consider a global runtime folder.

## ADR

The architectural decision behind this guide is recorded in:

```txt
docs/adr/archive/v0/0004-adopt-process-aware-feature-modules.md
```
