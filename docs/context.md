---
title: Space Zero Project Context
---

# Space Zero Project Context

## Purpose

Space Zero is an agentic desktop workspace for software builders.

The product exists to help builders plan, code, debug, manage knowledge, and ship software from one clean desktop GUI with minimal context switching.

## Product Thesis

Current AI building workflows are fragmented across AI chats, IDEs, terminals, browsers, docs, issue trackers, logs, and deployment tools. Space Zero should keep the builder's full working context in one place: code, agents, live sessions, skills, running app previews, debugging information, voice input, GitHub state, and project knowledge.

Space Zero owns the **builder-workspace layer**, not the agent-routing layer. The workspace, memory, and task-to-ship loop are the product. The agent harness is an implementation detail.

## Primary User

The primary user is a software builder who uses AI agents while building applications. They need to supervise agent work, inspect running apps, edit code, review diffs, manage GitHub work, and retain project context without constantly switching tools.

## Product Shape

- A real desktop GUI, not a terminal-first or TUI-first app.
- A polished project/session workspace inspired by tools like Conductor, Devin, VS Code, and Zed.
- Project sessions are first-class, with live sessions visible in a dedicated app surface.
- Editing, navigation, diffs, terminal/session output, browser preview, and debugging should converge in the desktop app.
- Pi is the default agent harness for v0.
- GitHub integration is first-class: issues, sessions, branches/worktrees, commits, PRs, reviews, and statuses should connect into one workflow.

## Domain Language

| Term | Meaning | Notes |
|---|---|---|
| Builder | A software creator using Space Zero to build and ship software. | Primary user. |
| Project | A local software repository or workspace managed by Space Zero. | Stored locally and eventually linked to GitHub repositories. |
| Session | A focused agent or builder workflow attached to a project/task. | May produce terminal output, code changes, branch/worktree state, and summaries. |
| Agent harness | The implementation layer used to run agent work. | Pi first. Multi-harness support is out of scope for v0. |
| Workspace | The desktop environment containing projects, sessions, code, terminal output, preview/debug surfaces, and knowledge. | Core product layer. |
| Preview/debug surface | Embedded browser-like app preview with debugging context near the agent workflow. | Should not be treated as a passive iframe long-term. |
| Task-to-ship loop | The workflow from issue/task selection through agent work, review, commit, PR, and status sync. | Differentiating workflow. |
| IPC | Electron inter-process communication between renderer/preload and main process. | The safe bridge for desktop operations. |

## Important Distinctions

- **Renderer vs main process:** Renderer code is UI. Main process code owns native desktop capabilities, SQLite, Git/GitHub system work, and future agent process orchestration.
- **Agent harness vs product layer:** Pi powers agent execution, but users should experience Space Zero as a workspace, not as a thin CLI wrapper.
- **Git CLI vs GitHub API:** Local repository operations should use the Git CLI. GitHub data and workflows should use Octokit.
- **Browser preview vs external browser:** The integrated preview/debug surface should bring app state and inspection closer to agent instructions.

## Business and Product Rules

- Space Zero should optimize for reducing context switching for builders.
- The app should favor a clean desktop GUI over terminal-first workflows.
- The v0 agent strategy is Pi-first; do not add multi-harness abstractions without a new decision.
- Electron is the v0 desktop shell because embedded browser/devtools capability and desktop process control matter more than a tiny binary.
- GitHub should be integrated deeply, not treated as a link-out-only experience.
- Project source repositories live outside the vault under `~/ws/dev/`; the vault tracks metadata and decisions only.

## External Systems

| System | Role | Boundary Notes |
|---|---|---|
| Pi | Default agent harness. | Future sessions should be orchestrated from main/utility process code, not renderer code. |
| Git CLI | Local repository operations. | Main process should own child-process execution and validation. |
| GitHub API / Octokit | GitHub account, issues, PRs, checks, workflow runs, comments, and status sync. | Credentials must be stored safely and not exposed to renderer code. |
| SQLite | Local app persistence. | Lives in main process behind typed IPC APIs. |
| Chromium/Electron | Desktop shell, renderer runtime, and future embedded preview/debug surface. | Preserve secure Electron defaults. |

## Decisions and References

- `docs/adr/0001-use-electron-for-the-desktop-shell.md`
- `docs/adr/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/0003-store-local-app-state-in-sqlite-from-the-main-process.md`
- Engineering rules: `docs/engineering/`

## Maintenance Rules

- Update this file when durable product language changes.
- Do not store temporary implementation plans here; use GitHub Issues for specs and tasks.
- Do not duplicate coding doctrine here; use `docs/coding-standards.md` and `docs/engineering/`.
