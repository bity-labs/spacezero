---
title: Agent Session Projection Reference Notes
---

# Agent Session Projection Reference Notes

Issue #48 evaluated `@assistant-ui/react-pi` v0.0.6 as a reference pattern, not a Space Zero dependency. Its projection ideas remain historical research; its renderer/preload/main transport does not define v0.1 architecture.

Reference files originally studied:

- `packages/react-pi/src/runtime/threadState.ts`
- `packages/react-pi/src/runtime/messageProjection.ts`
- `packages/react-pi/src/runtime/ThreadController.ts`
- `packages/react-pi/src/runtime/usePiRuntime.ts`
- `packages/react-pi/src/runtime/hostUi.ts`
- `packages/react-pi/src/types.ts`

## Current Space Zero boundary

- **Transport:** Desktop renderer consumes plain Project Session projections through `packages/client-runtime`. Client Runtime uses authenticated Effect HttpApi Client and streaming `fetch()` SSE directly with Workspace Host. Electron IPC is not the Session event transport.
- **Source of truth:** the Workspace Host Session Event Journal and rebuildable projections are authoritative for Space Zero product behavior. Pi transcripts remain private Pi Adapter data.
- **UI state:** Client Runtime maps Host Contracts into plain immutable UI-facing projection values. React and generic chat components do not import Pi types, Effect Streams, HttpApi types, or Host services.
- **Confirmation:** approval requests and resolutions are versioned Host Protocol behavior enforced by Workspace Host authorization and Session policy. Renderer UI submits an authenticated Host command; Electron main does not own paused Pi tool routing.
- **Reconnect:** a snapshot states the durable Session sequence it includes, and Client Runtime resumes ordered durable events after that cursor. Ephemeral streaming deltas are never mistaken for committed history.
- **Testing:** deterministic projection and renderer tests use a contract-compatible mock Host. Headless real-Host tests verify event commit, replay, SSE, interruption, and reconnect semantics.

The old `window.spacezero.agent.*` broker and Pi utility-process projection are archived v0 implementation details and must not be reintroduced.
