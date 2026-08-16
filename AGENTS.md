# Agent Instructions

This repository uses TStack: a small harness for disciplined agentic software delivery.

## Project Identity

Space Zero is an Electron desktop app for software builders. It aims to become a zero-friction workspace for agentic development: projects, code, agents, terminal/session output, browser preview/debugging, local knowledge, and GitHub workflows in one desktop GUI.

## Navigation Protocol

1. Read this file first.
2. Read `docs/coding-standards.md` before changing code.
3. Read `docs/context.md` when the task touches product behavior, domain language, or user-facing concepts.
4. Read `docs/feature-architecture.md` before adding, moving, or reorganizing feature source code.
5. Read `docs/engineering/index.md` and load only the engineering rule files relevant to the task.
6. Check `docs/adr/` before changing Electron architecture, process boundaries, data ownership, persistence, IPC, packaging, or testing strategy.

## Source of Truth

- GitHub Issues hold specs, tasks, and acceptance criteria.
- `docs/context.md` holds durable Space Zero product and domain language.
- `docs/coding-standards.md` holds project-level implementation expectations.
- `docs/feature-architecture.md` holds feature module layout, file naming, and runtime-boundary rules.
- `docs/engineering/` holds reusable TStack engineering doctrine.
- `docs/adr/` holds important architectural decisions and rationale.
- `.agents/skills/` holds reusable workflows that use the docs.

## Current Architecture Snapshot

- Space Zero v0.1 uses a separately executable Workspace Host for the Project catalog, Project Session execution, Pi integration, Session workspaces, Git operations, and durable Session state.
- The initial Local Host is a separate process managed by Electron Desktop, run under packaged private Node.js `22.23.1`, and reached over an authenticated loopback protocol.
- Workspace tooling, CI, Local Host packaging, and Host-native modules standardize on Node.js `22.23.1`; public builds do not use `ELECTRON_RUN_AS_NODE` or Electron `utilityProcess` for the Host and disable unnecessary Electron Node-mode and Node-options fuses.
- Local Host startup uses a protected one-time bootstrap secret; Electron main alone holds Host-lifetime supervisor authority, while renderer/Client Runtime receives only short-lived scoped client capabilities.
- Desktop restarts unexpected Local Host crashes with bounded backoff, fresh bootstrap, and worktree reconciliation, but never automatically replays ambiguous turns or external side effects.
- Test Host behavior headlessly through real HTTP/SSE, SQLite, and Git. Use a contract-compatible mock Host for broad Electron UI/navigation/screenshot E2E, with narrow real-Host Electron and packaged-runtime suites for boundary validation.
- Electron main owns native app lifecycle, windows, secure preload APIs, updates, and Local Host process management; it does not own Project Session execution.
- React renderer owns UI only and must not receive raw Node.js, filesystem, process, database, or credential access.
- Host protocol contracts use Effect Schema and must remain serializable and independent of Electron, React, Pi SDK types, and persistence implementations.
- The Project Session domain is event-sourced in the Local Host's SQLite database using exact-pinned Effect 4 `@effect/sql-sqlite-node` over `better-sqlite3`; relational projections are rebuildable and Pi transcripts remain private adapter data.
- One initial Project Session owns one Pi conversation and one authenticated managed Git worktree/branch created from the registered checkout's committed current `HEAD`; missing or inconsistent identity must fail closed.
- Effect 4 is used across Host Contracts, Workspace Host, Pi Adapter, and Client Runtime with one exact workspace-wide beta version and compatible ecosystem pins. React and generic UI components remain Effect-free.
- Pi owns Host-global LLM authentication in private Workspace Host application data; secrets must not enter SQLite, Session events, transcripts, worktrees, logs, URLs, or persistent renderer state.

## Working Rules

- Understand the requested outcome before editing.
- Ask when intent, domain meaning, security risk, or architectural impact is unclear.
- Keep changes small and focused.
- Do not mix unrelated refactoring into feature or bug-fix work.
- Do not add dependencies or major abstractions without asking.
- Preserve Electron security defaults unless an ADR explicitly changes them.
- Prefer behavior verified through public interfaces and IPC boundaries.
- Validate before finishing, or explain why validation could not be run.
- Use `scripts/run_silent` for noisy validation commands when useful, so successful checks stay compact and failures show full output.
- Report what changed, what was validated, and what risk remains.
