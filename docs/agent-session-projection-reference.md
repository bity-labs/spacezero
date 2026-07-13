---
title: Agent Session Projection Reference Notes
---

# Agent Session Projection Reference Notes

Issue #48 uses `@assistant-ui/react-pi` v0.0.6 as a reference pattern, not a dependency.

Reference files read before implementation:

- `packages/react-pi/src/runtime/threadState.ts`
- `packages/react-pi/src/runtime/messageProjection.ts`
- `packages/react-pi/src/runtime/ThreadController.ts`
- `packages/react-pi/src/runtime/usePiRuntime.ts`
- `packages/react-pi/src/runtime/hostUi.ts`
- `packages/react-pi/src/types.ts`

## Space Zero deviations

- **Transport:** assistant-ui's controller talks to a `PiClient`; Space Zero's renderer hook subscribes through `window.spacezero.agent.onSessionProjectionEvent`, preserving the renderer → preload → main broker boundary from ADR 0006.
- **UI state target:** assistant-ui projects into `ThreadMessageLike`; Space Zero projects into local `AiChatMessage` parts used by copied shadcn/AI Elements components.
- **Confirmation:** assistant-ui host-UI helpers answer browser-side requests; Space Zero exposes `resolveToolConfirmation` through preload so answers route back through main, where safety policy, activity history, and paused tool-call routing belong.
- **Scope:** this slice implements the browser-safe JSON contract, snapshot-authoritative reducer, projection, and hook. Utility-side transcript snapshots and paused tool-call resolution are separate broker/runtime slices.
