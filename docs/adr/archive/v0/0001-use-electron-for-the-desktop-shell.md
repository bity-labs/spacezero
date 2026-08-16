---
title: Use Electron for the Desktop Shell
---

## Status

Accepted

## Context

Space Zero is a desktop workspace for software builders. The v0 product needs a polished GUI that can bring together project sessions, editor surfaces, terminal/session output, browser preview/debugging, local persistence, Git/GitHub workflows, and agent process orchestration.

The app needs strong embedded browser capability and desktop process control early. The team also wants a JavaScript/TypeScript-focused implementation with React, Vite, Tailwind, shadcn/ui-compatible components, Monaco, xterm.js, SQLite, and Pi integration.

## Decision

The project uses Electron as the v0 desktop shell.

The renderer uses React and TypeScript. Electron main/preload processes own desktop capabilities and expose them through typed IPC APIs.

## Rationale

Electron provides:

- Built-in Chromium for browser-like UI and future embedded preview/debug surfaces.
- Mature Node.js/process integration for local files, git, SQLite, child processes, and agent sessions.
- A strong ecosystem for terminal panes, editor panes, webviews, desktop shell behavior, packaging, and testing.
- A fast path for a TypeScript-first implementation.

This matters more for v0 than small binary size.

## Consequences

- App size and memory usage will be larger than a Tauri/native implementation.
- Electron security defaults must be actively preserved.
- Native dependencies such as SQLite must be rebuilt and packaged correctly.
- Future distribution will need platform-specific signing/notarization decisions.
- Tauri can be reconsidered later if binary size, memory, or distribution pressure outweighs Electron's capabilities.

## Alternatives Considered

- Tauri — smaller binaries and Rust backend, but weaker fit for the immediate embedded browser/devtools and TypeScript-first process orchestration needs.
- Native macOS app — best platform integration, but slower to build cross-platform and less aligned with the React/TypeScript stack.
- Web app only — simpler deployment, but cannot own local process, git, agent, preview/debug, and desktop workspace capabilities deeply enough.

## Review Trigger

Revisit this decision if Electron performance, memory usage, app size, security surface, or distribution complexity blocks product adoption or development velocity.
