---
title: Use xterm.js and node-pty for the Terminal Tool
---

## Status

Accepted

## Supersession Note

ADR 0022 supersedes this ADR's Tool Pane and internal Terminal-tab layout assumptions. Its xterm.js, PTY ownership, security boundary, and lifecycle decisions remain accepted; each terminal/PTY is now represented by one Side Pane Tab.

## Context

Space Zero needs one shared interactive Terminal Tool for Project Sessions, Workspace Sessions, and the Knowledge Base. It must provide terminal emulation in the renderer while keeping shell creation, process access, and native capabilities outside the renderer under the secure Electron boundaries established by ADR 0002.

A terminal renderer alone does not provide a real pseudoterminal, and directly exposing shell or process APIs to renderer code would violate the application's security model. The selected stack also needs to support terminal resizing and normal interactive shell behavior on macOS, Linux, and Windows.

Relevant product work is described by issues #121, #131, and #132.

## Decision

The Terminal Tool uses:

- `@xterm/xterm` in the renderer for terminal emulation, display, and keyboard input;
- `@xterm/addon-fit` in the renderer to fit terminal rows and columns to the available Tool Pane size; and
- `node-pty` in Electron main for PTY-backed shell processes.

Electron main owns PTY creation, process identity, input/output, resize, exit, and termination. Preload exposes a narrow typed Terminal API through `window.spacezero`. The renderer receives terminal output and exit events and may request validated operations such as create, write input, resize, subscribe, unsubscribe, and terminate; it never receives Node.js, raw `node-pty`, or unrestricted process access.

## Rationale

xterm.js is the established browser terminal emulator used by integrated development tools, while `node-pty` provides the native pseudoterminal behavior required by interactive shells and full-screen terminal applications. The official fit addon provides the renderer-side size calculation needed to keep PTY dimensions synchronized with the resizable Tool Pane.

Splitting responsibilities at the preload/IPC boundary preserves Space Zero's renderer isolation while allowing main to validate context roots, own process cleanup, and enforce resource limits.

## Consequences

- `node-pty` is a native dependency and must be rebuilt and packaged for each supported Electron platform and architecture.
- Terminal IPC requires explicit streaming subscription, unsubscription, backpressure/resource policy, resize, exit, and cleanup contracts.
- Renderer tests should mock the typed Terminal API; main-process tests should exercise PTY lifecycle through an adapter seam rather than requiring renderer access.
- Shell processes run with the same operating-system permissions as Space Zero, so renderer input and persisted process identities must be treated as security-sensitive.
- Optional xterm.js addons or custom link providers require separate product justification; they are not implicitly authorized by this decision.

## Alternatives Considered

- `@xterm/xterm` without a PTY backend — rejected because it renders a terminal but cannot provide correct interactive shell semantics.
- Direct Node.js or shell access from the renderer — rejected because it violates ADR 0002 and expands the impact of untrusted rendered content.
- Pipe-based `child_process.spawn` without a PTY — rejected because interactive shells, terminal sizing, job control, and full-screen applications would behave incorrectly.
- A bespoke terminal emulator or PTY implementation — rejected because it would add substantial cross-platform complexity without product differentiation.

## Review Trigger

Revisit this decision if native packaging reliability, platform support, security constraints, accessibility, performance, or maintenance status makes either xterm.js or `node-pty` unsuitable for supported Space Zero platforms.
