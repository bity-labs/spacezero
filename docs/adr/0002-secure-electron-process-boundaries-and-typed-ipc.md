---
title: Secure Electron Process Boundaries and Typed IPC
---

## Status

Accepted

## Context

Space Zero will eventually run agent processes, git commands, local dev commands, SQLite queries, GitHub API calls, and browser/debug workflows. These capabilities are powerful and sensitive. Renderer UI code must not receive unrestricted Node.js, filesystem, shell, database, or credential access.

Electron apps are especially vulnerable when renderer code has too much authority. Agent output, project files, and future embedded web content may contain untrusted data.

## Decision

Space Zero uses strict Electron process boundaries:

- Main process owns native desktop capabilities, system access, SQLite, child processes, credentials, Git/GitHub, and future agent orchestration.
- Preload exposes a narrow typed API as `window.spacezero`.
- Renderer code owns UI only and calls desktop capabilities through typed IPC.
- Shared IPC channel names and cross-process contracts live in `src/shared`.

Default window settings preserve isolation:

```ts
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: join(__dirname, '../preload/index.mjs')
}
```

## Rationale

This keeps the UI productive while limiting blast radius. It also gives agents and future maintainers an explicit place to add capabilities: define the contract, expose it in preload, implement and validate it in main.

Typed IPC makes boundaries discoverable and reviewable, which is critical for a desktop app that can run commands and touch local repositories.

## Consequences

- Adding a new desktop capability requires coordinated changes in shared types, preload, and main IPC handlers.
- Renderer development is slightly more verbose than direct Node.js access.
- IPC inputs need validation, especially for paths, command-like operations, credentials, external data, and agent/session controls.
- Long-running or streaming operations need explicit lifecycle design and cleanup.

## Alternatives Considered

- Enable `nodeIntegration` in renderer — simpler but unsafe for an app handling local projects, agents, credentials, and future web content.
- Expose raw `ipcRenderer` to the renderer — flexible but makes APIs harder to audit and easier to misuse.
- Put all business logic in renderer — simpler early, but undermines security and future process orchestration.

## Review Trigger

Revisit if Electron introduces a safer default API model, if multi-window/webview requirements force more granular boundaries, or if agent/session orchestration needs a dedicated utility process boundary.
