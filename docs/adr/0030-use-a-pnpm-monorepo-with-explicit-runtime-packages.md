# ADR 0030: Use a pnpm monorepo with explicit runtime packages

## Status

Accepted

## Context

Space Zero v0.1 contains two independently runnable applications and several intentional shared boundaries. The repository must prevent Electron, Pi, Node infrastructure, persistence, and React concerns from leaking across those boundaries while avoiding speculative packages and build orchestration.

The fresh-start repository already sketches `apps/desktop`, `apps/workspace-host`, `packages/host-contracts`, `packages/client-runtime`, and `packages/pi-adapter`. The archived v0 process-aware feature layout under one Electron application is not the source layout for v0.1.

## Decision

Space Zero will use one pnpm workspace and lockfile with strict ESM TypeScript.

The initial implementation boundaries are:

```text
apps/
  desktop/          Electron shell, React client, native integration, Local Host management
  workspace-host/   Headless Effect application, HTTP/SSE, SQLite, Sessions, Git/worktrees

packages/
  host-contracts/   Browser-safe Effect Schemas for protocol/domain contracts
  client-runtime/   Browser-safe Effect Host client and in-memory projections
  pi-adapter/       Host-side Effect boundary around the Pi SDK
```

Existing `apps/handbook` and `packages/ui` placeholders remain non-implementation directories until a concrete delivery slice needs them.

### Dependency direction

The intended dependency graph is:

```text
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
- Host Contracts do not depend on Electron, React, Pi, Node filesystem/process APIs, or persistence implementations;
- Client Runtime remains browser-safe and does not depend on Electron or Pi;
- Pi Adapter remains Host-side and does not depend on Desktop or Client Runtime;
- Electron-native behavior remains inside Desktop;
- Session persistence, Git/worktrees, processes, and Pi execution remain inside Workspace Host or its Host-side adapters; and
- React and generic UI code consume plain Client Runtime snapshots and commands rather than Host or Effect runtime internals.

### Package creation

The repository will not create a separate `session-domain` package initially. Serializable Session commands, events, projections, and errors belong in Host Contracts; Host-only services and projectors belong in Workspace Host. A new package requires a second concrete consumer or a boundary that materially improves independent testing or deployment.

Pi Adapter is activated when the first Pi Session slice begins. UI and handbook packages are activated only when their own vertical slices require them.

### Tooling

- pnpm is the package manager.
- One Node LTS line and pnpm version are pinned at repository setup.
- TypeScript is strict and ESM-first.
- Root scripts provide focused `typecheck`, `lint`, `test`, `build`, and end-to-end entrypoints across active workspaces.
- Effect package versions are pinned consistently across the workspace.
- Project/package build outputs are consumed through package exports, not deep source imports.
- Workspace Host release output is a TypeScript-compiled strict ESM normal Node deployment with pnpm-pruned production dependencies as specified by ADR 0038; it is not bundled initially.
- Nx and Turborepo are not introduced initially. pnpm workspace filters and ordinary scripts are sufficient until measured build-graph or caching pain justifies another tool.

### Testing boundaries

- Host Contracts have schema compatibility and decoding tests.
- Client Runtime has transport, authentication, reconnect, cursor, and projection tests without Electron.
- Workspace Host has headless service, real-SQLite, event replay, worktree, Pi Adapter integration, and HTTP/SSE contract tests.
- Desktop has renderer/component tests plus Electron integration tests for Local Host management and security boundaries.
- Packaged-system tests prove Desktop can launch the bundled Local Host runtime and complete the initial protocol handshake.

## Rationale

The structure follows independently deployable runtimes first and shares only explicit contracts and reusable runtime behavior. It gives future Remote Hosts and clients a path without forcing Desktop and Host into one Electron source tree.

Deferring extra packages and build orchestrators keeps the first vertical slice understandable. Explicit package exports and tests provide stronger boundaries than directory naming alone.

## Consequences

- The archived v0 `src/main`, `src/preload`, `src/renderer`, and `src/features` layout is not used as the v0.1 repository root architecture.
- Desktop may organize its own Electron main/preload/renderer code internally, but it cannot become the owner of Host behavior.
- Workspace Host owns its own composition root and infrastructure adapters.
- Root tooling and CI must understand multiple applications and packages from the first implementation slice.
- Adding a package requires an explicit present need rather than completing a speculative architecture diagram.

## Alternatives Considered

- **Retain the v0 process-aware feature tree under one application** — rejected because it centers Electron and obscures independently deployable Host ownership.
- **Create every future app and package immediately** — rejected because empty architecture creates maintenance and dependency ambiguity without executable behavior.
- **Add a generic Session Domain package immediately** — rejected until a second consumer needs Host-side domain behavior rather than only serialized contracts.
- **Adopt Nx or Turborepo immediately** — rejected because the initial workspace is small and pnpm scripts can express the required graph.
- **Allow cross-app source imports** — rejected because it defeats independent build, test, and deployment boundaries.

## Review Trigger

Revisit this decision if:

- a second concrete runtime needs reusable Session-domain reducers or services;
- package build ordering or caching becomes a measured development bottleneck;
- mobile/web implementation requires a boundary not represented by Host Contracts and Client Runtime; or
- the private Host runtime packaging requires a separately versioned distributable workspace.
