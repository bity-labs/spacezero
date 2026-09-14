# Agent Instructions

## Project Identity

Space Zero is an Electron desktop app for software builders. It aims to become a zero-friction workspace for agentic development: projects, code, agents, terminal/session output, browser preview/debugging, local knowledge, and GitHub workflows in one desktop GUI.

## Navigation Protocol

1. Read this file first.
2. Read `docs/coding-standards.md` before changing code.
3. Read `docs/context.md` when the task touches product behavior, domain language, or user-facing concepts.
4. Read `docs/feature-architecture.md` before adding, moving, or reorganizing feature source code.
6. Check `docs/adr/` before changing Electron architecture, process boundaries, data ownership, persistence, IPC, packaging, or testing strategy.

## Source of Truth

- GitHub Issues hold specs, tasks, and acceptance criteria.
- `docs/context.md` holds durable Space Zero product and domain language.
- `docs/coding-standards.md` holds project-level implementation expectations.
- `docs/feature-architecture.md` holds feature module layout, file naming, and runtime-boundary rules.
- `docs/adr/` holds important architectural decisions and rationale.

## Current Architecture Snapshot

- Electron main process owns native app lifecycle, windows, IPC handlers, SQLite, and future system integrations.
- Electron preload exposes the only renderer-facing desktop API as `window.spacezero`.
- React renderer owns UI only and must not receive raw Node.js access.
- Shared IPC channel names and types live in `src/shared`.
- SQLite lives behind main-process APIs, not in renderer code.

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
