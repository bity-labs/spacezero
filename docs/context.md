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
| Command Palette | The user-facing searchable action launcher for Space Zero commands. | Product/UI name. Intended as a mini Raycast-like launcher inside the application for builder-driven command discovery and execution. It is UI over the App Command Registry, not the owner of command behavior. |
| App Command Registry | The internal catalog of human-facing app commands that can be discovered and invoked from the Command Palette, keyboard shortcuts, menus, or future human UI surfaces. | Commands have stable IDs, user-facing titles, categories, optional search keywords, optional default keyboard shortcuts, and handlers or invocation targets. Renderer-local commands may be handled in the renderer; privileged or persisted commands route through preload/IPC to main-process application services. |
| Agent Workspace | The user-facing in-app surface where a builder asks an agent to inspect, explain, and operate Space Zero. | Product/UI name. Agents act through Workspace Tools, not backdoors into storage or UI internals. |
| Workspace Control Plane | The internal application-level command/query layer for inspecting and operating the workspace. | Architecture term shared by human UI flows and agent tools. |
| Workspace Tools | Typed capabilities exposed to agents so they can safely call Space Zero application behavior. | Agent-facing and separate from human-facing App Commands. Route into the same main-process application services used by the UI when affecting app state. Each tool should declare a safety level and be grouped by product domain. |
| Workspace Tool Registry | The explicit catalog of Workspace Tools available to agents. | Separate from the App Command Registry. Used to expose approved tools to Pi, validate inputs, enforce safety policy, and record activity history. |
| Workspace Tool Safety Policy | Global user-configurable rules that decide whether agent tool calls require confirmation. | Defaults should be conservative, but builders can opt into allowing write or dangerous tools without confirmation. Per-project overrides are out of scope for v0. |
| Agent Activity History | Lightweight history of Workspace Tool calls performed by agents. | Used for visibility, debugging, status summaries, and future undo support. Not a compliance-grade audit log. |
| App Command | A stable human-facing command ID representing an action the builder can trigger in Space Zero. | Inspired by editor command systems such as VS Code. Used by keyboard shortcuts, command palette, menus, and buttons where useful. |
| Keyboard Shortcut | An app-focused keybinding that triggers a Space Zero App Command while Space Zero is focused. | v0 shortcuts are in-app only, not OS-global hotkeys. Shortcuts should ship with defaults, be user-remappable like editor keybindings, and support context-aware activation. |
| Preview/debug surface | Embedded browser-like app preview with debugging context near the agent workflow. | Should not be treated as a passive iframe long-term. |
| Task-to-ship loop | The workflow from issue/task selection through agent work, review, commit, PR, and status sync. | Differentiating workflow. |
| IPC | Electron inter-process communication between renderer/preload and main process. | The safe bridge for desktop operations. |

## Important Distinctions

- **Renderer vs main process:** Renderer code is UI. Main process code owns native desktop capabilities, SQLite, Git/GitHub system work, and future agent process orchestration.
- **Agent harness vs product layer:** Pi powers agent execution, but users should experience Space Zero as a workspace, not as a thin CLI wrapper.
- **Git CLI vs GitHub API:** Local repository operations should use the Git CLI. GitHub data and workflows should use Octokit.
- **Browser preview vs external browser:** The integrated preview/debug surface should bring app state and inspection closer to agent instructions.
- **Command Palette vs command behavior:** The Command Palette is a human-facing discovery and invocation surface for App Commands. It should not own the implementation of command behavior.
- **UI commands vs app-state commands:** App Commands can represent renderer-local UI/navigation actions or privileged app-state actions. Privileged or persisted actions must cross the preload/IPC boundary into main-process application services.
- **App Commands vs Workspace Tools:** App Commands are human-facing commands for the Command Palette, keyboard shortcuts, menus, and future human UI surfaces. Workspace Tools are agent-facing typed capabilities. They use separate registries, but app-state actions should converge on the same main-process application services.
- **Workspace tools vs backdoors:** Agents should operate Space Zero through typed Workspace Tools that route into the same application services as the UI. They should not directly mutate SQLite, bypass IPC/application validation, or rely on brittle renderer UI automation for first-class app actions.
- **Tool safety vs user autonomy:** Workspace Tools should declare safety levels such as read, write, and dangerous. Confirmation requirements are controlled by user settings so cautious builders can require approval while power users can allow dangerous actions without confirmation.

## Business and Product Rules

- Space Zero should optimize for reducing context switching for builders.
- The app should favor a clean desktop GUI over terminal-first workflows.
- The v0 agent strategy is Pi-first; do not add multi-harness abstractions without a new decision.
- Electron is the v0 desktop shell because embedded browser/devtools capability and desktop process control matter more than a tiny binary.
- GitHub should be integrated deeply, not treated as a link-out-only experience.
- Project source repositories live outside the vault under `~/ws/dev/`; the vault tracks metadata and decisions only.
- Meaningful user actions should be implemented as application capabilities that can be reached by the renderer UI and, when appropriate, exposed as Workspace Tools for agents.
- The Command Palette should be a searchable mini Raycast-like UI inside Space Zero over the App Command Registry, not a place where command behavior is implemented directly.
- App commands should have stable IDs, user-facing titles, categories, optional search keywords, optional default keyboard shortcuts, and handlers or invocation targets.
- App commands may include both navigation/UI commands and app-state commands. Renderer-local UI commands may stay in renderer code; privileged or persisted app-state commands must go through `window.spacezero`, preload, typed IPC, and main-process application services.
- The Command Palette itself is renderer-owned UI. It owns presentation, search, keyboard interaction, and selection state, not privileged app behavior.
- The v0 App Command Registry should be generic to the app and does not need context-aware command availability. Context-aware commands, such as commands depending on the current project, session, selection, or focused panel, are a later enhancement.
- Workspace Tools should be designed as reusable internal application capabilities, but v0 exposes them only to the in-app Agent Workspace. External automation surfaces such as a CLI, MCP server, local socket, or public API are future possibilities, not v0 commitments.
- Workspace Tools should be grouped by product domain, matching feature areas such as workspace, projects, sessions, settings, and preview. Composed tools such as `workspace.getStatus` are allowed when they serve a clear product need, but teams should not create aggregate tools speculatively for every feature.
- Space Zero should keep a lightweight Agent Activity History for agent Workspace Tool calls. It should capture enough to explain what happened without becoming a heavy compliance audit system or storing sensitive full payloads by default.
- Keyboard shortcuts should be app-focused command accelerators in v0. They work when Space Zero is focused and should not use OS-global Electron `globalShortcut` registration for normal app actions.
- Keyboard shortcuts should resolve to stable App Command IDs rather than directly calling scattered callbacks. This follows editor-style command systems, where shortcuts, command palette entries, menus, and buttons can converge on the same command handler.
- Keyboard shortcuts should be user-remappable like VS Code/editor keybindings. The foundation should separate command identity, default keybinding, and user override keybinding.
- Keyboard shortcuts should support context-aware activation, similar to editor `when` clauses. The v0 implementation can start with simple context flags such as text input focused, modal open, command palette open, terminal focused, preview focused, or editor focused.
- Keyboard shortcuts should use a normalized cross-platform syntax such as `mod+k`, `mod+shift+p`, `alt+enter`, and `escape`. `mod` maps to Command on macOS and Control on Windows/Linux, while UI can render platform-native labels.
- Keyboard shortcut v0 should support single-stroke shortcuts only. Multi-step key chords such as `mod+k mod+s` are a future possibility, not part of the initial foundation.
- Keyboard shortcut event handling and shortcut resolution should live in the renderer because v0 shortcuts are in-app UI behavior. If a shortcut triggers app-state or native behavior, its command handler should use the normal preload/IPC/main application-service path rather than bypassing Electron security boundaries.
- Workspace Tool results should be structured data only. Agents are responsible for interpreting and summarizing tool results in conversation; tool results should not include polished human-readable summaries.
- Workspace Tools should be exposed through an explicit Workspace Tool Registry rather than ad hoc callable functions. The registry is the approved catalog passed to the agent harness, including tool names, input schemas, safety levels, and handlers.
- Each feature should own its Workspace Tool definitions near its main-process application services. The Agent Workspace or Workspace Control Plane composes feature-owned tools into the registry passed to Pi.
- Renderer IPC handlers, App Command handlers, and Workspace Tool handlers may be separate entrypoints, but app-state behavior must route into the same main-process application services for the underlying use cases.
- The App Command Registry and Workspace Tool Registry are separate catalogs because human-facing commands and agent-facing tools need different metadata, schemas, safety policy, and UX. They may converge on the same application services when they affect app state.
- Workspace Tools may include both domain/application actions and UI/navigation control actions. Tool metadata should distinguish UI control tools from app-state tools so safety policy, history, and agent instructions can treat them differently.
- UI-control Workspace Tools should still enter through the main-process tool layer. Main should validate, apply safety policy, record activity when appropriate, and then send typed UI commands/events to the renderer. Agents should not directly manipulate renderer internals.

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
