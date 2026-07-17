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
| Session | A focused agent or builder workflow. Space Zero has two session kinds: **Project Session** and **Workspace Session** (see below). | A session may produce terminal output, code changes, branch/worktree state, and summaries. Both session kinds are built from the same reusable **Chat Components** UI and backed by one Pi `AgentSession` each. |
| Agent harness | The implementation layer used to run agent work. | Pi first. Multi-harness support is out of scope for v0. |
| Skill | A reusable, on-demand agent capability package defined by a `SKILL.md` file. | Skills may be global or project-local; Space Zero discovers them and delegates `/skill:name` expansion to Pi. |
| Workspace | The desktop environment containing projects, sessions, code, terminal output, preview/debug surfaces, and knowledge. | Core product layer. |
| Space Zero Home | The configurable user-owned root for Space Zero-managed content. | Defaults to `~/SpaceZero`; managed projects and repositories are created under `projects/`. |
| Command Palette | The user-facing searchable action launcher for Space Zero commands. | Product/UI name. Intended as a mini Raycast-like launcher inside the application for builder-driven command discovery and execution. It is UI over the App Command Registry, not the owner of command behavior. |
| App Command Registry | The internal catalog of human-facing app commands that can be discovered and invoked from the Command Palette, keyboard shortcuts, menus, or future human UI surfaces. | Commands have stable IDs, user-facing titles, categories, optional search keywords, optional default keyboard shortcuts, and handlers or invocation targets. Renderer-local commands may be handled in the renderer; privileged or persisted commands route through preload/IPC to main-process application services. |
| Agent Workspace | The user-facing in-app surface where a builder asks an agent to inspect, explain, and operate Space Zero. | Product/UI name. Agents act through Workspace Tools, not backdoors into storage or UI internals. |
| Workspace Control Plane | The internal application-level command/query layer for inspecting and operating the workspace. | Architecture term shared by human UI flows and agent tools. |
| Workspace Tools | Typed capabilities exposed to agents so they can safely call Space Zero application behavior. | Agent-facing and separate from human-facing App Commands. Route into the same main-process application services used by the UI when affecting app state. Each tool should declare a safety level and be grouped by product domain. |
| Workspace Tool Registry | The explicit catalog of Workspace Tools available to agents. | Separate from the App Command Registry. Used to expose approved tools to Pi, validate inputs, enforce safety policy, and record activity history. |
| Project Session | An agent session triggered from a Project that runs with that project's context and working directory. | The builder's coding agent operating on the project repository. Uses Pi's built-in project tools against the project cwd plus Space Zero Workspace Tools. |
| Workspace Session | A global agent session spawnable at any time (command-palette-like), with no required project context. | The agent that operates Space Zero itself via Workspace Tools and answers quick workspace questions. May be invoked from the Command Palette. |
| Chat Components | A reusable pure-UI component package covering everything needed to run an agent session. | Includes chat messages (user/assistant text + thinking), chat input, streaming text, per-session model selector, per-session thinking selector, tool-call rendering, inline tool-use confirmation, and running/idle indicators. Both Project Sessions and Workspace Sessions are built from Chat Components. |
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
- **Project tools vs Workspace Tools:** Pi's built-in tools (`bash`, `edit`, `write`, `read`, `grep`, `find`, `ls`) operate the project layer — the builder's repository — and run entirely inside the utility process. Space Zero Workspace Tools operate the app layer — Space Zero itself — and are registered as additional Pi custom tools whose `execute()` is a thin proxy that calls main over the `MessagePort`; the real handler, validation, safety policy, and Agent Activity History run in main. One Pi `AgentSession` carries both domains. The no-backdoors rule applies to Space Zero app internals, not to the user's project files.
- **One AgentSession per Space Zero Session, many live concurrently:** The utility process holds a `Map<sessionId, AgentSession>`. Multiple sessions run in the background; the active session is a UI focus concept, not a runtime limit. A resource cap on concurrent live sessions is a tunable, not an architectural constraint.
- **Pi internals vs Space Zero source of truth:** Pi's `SessionManager`/`SettingsManager`/`DefaultResourceLoader` are used only inside the utility for the agent transcript and runtime config. Space Zero SQLite owns project/session/branch metadata and links to Pi transcript paths. Pi's broad default resource auto-discovery is not used for v0; Space Zero explicitly composes approved skill paths and tool composition through the SDK.
- **Managed workspace content vs application data:** Space Zero Home contains user-owned managed content such as projects, worktrees, knowledge, skills, and artifacts. Private application data such as SQLite, credentials, raw transcripts, logs, and caches stays in the OS application-data directory by default. Existing projects may remain at external paths and are registered rather than moved.
- **LLM auth/models vs app state:** LLM provider credentials and the model catalog are owned by Pi inside the utility (`auth.json`/`models.json` under the Space Zero agent dir), not mirrored in SQLite. The model catalog is workspace-global (one shared Pi `ModelRegistry`); each session selects its own model and thinking level. New sessions start from a workspace-global default model + default thinking level defined in Space Zero Settings; sessions may override both. Per-project default model/thinking is a v1 enhancement. OAuth is supported from day one via the OS browser + a `spacezero://` deep link routed through main. User-defined custom providers are deferred to a tracked enhancement issue but must be designed for.
- **Git CLI vs GitHub API:** Local repository operations should use the Git CLI. GitHub data and workflows should use Octokit.
- **Browser preview vs external browser:** The integrated preview/debug surface should bring app state and inspection closer to agent instructions.
- **Command Palette vs command behavior:** The Command Palette is a human-facing discovery and invocation surface for App Commands. It should not own the implementation of command behavior.
- **UI commands vs app-state commands:** App Commands can represent renderer-local UI/navigation actions or privileged app-state actions. Privileged or persisted actions must cross the preload/IPC boundary into main-process application services.
- **App Commands vs Workspace Tools:** App Commands are human-facing commands for the Command Palette, keyboard shortcuts, menus, and future human UI surfaces. Workspace Tools are agent-facing typed capabilities. They use separate registries, but app-state actions should converge on the same main-process application services.
- **Workspace tools vs backdoors:** Agents should operate Space Zero through typed Workspace Tools that route into the same application services as the UI. They should not directly mutate SQLite, bypass IPC/application validation, or rely on brittle renderer UI automation for first-class app actions.
- **UI base vs agent runtime:** The agent UI base (shadcn Chat Components + AI Elements) is presentational only — components accept props and emit callbacks and do not bundle an agent runtime, transport, or backend. The renderer feeds them state from `window.spacezero.agent.*` IPC events brokered through main. assistant-ui's `@assistant-ui/react-pi` and CopilotKit couple to their own runtime/transport and are not used as dependencies; `react-pi`'s source is a reference pattern only (issue #48) for the Pi event → UI state projection.
- **Tool safety vs user autonomy:** Workspace Tools should declare safety levels such as read, write, and dangerous. Confirmation requirements are controlled by user settings so cautious builders can require approval while power users can allow dangerous actions without confirmation.
- **Skills vs Knowledge Base:** Skills are reusable behavioral instructions loaded on demand; the Knowledge Base stores durable user knowledge and documentation. Skills should not be silently copied into or managed as Knowledge Base content.

## Business and Product Rules

- Space Zero should optimize for reducing context switching for builders.
- The app should favor a clean desktop GUI over terminal-first workflows.
- The v0 agent strategy is Pi-first; do not add multi-harness abstractions without a new decision.
- Electron is the v0 desktop shell because embedded browser/devtools capability and desktop process control matter more than a tiny binary.
- GitHub should be integrated deeply, not treated as a link-out-only experience.
- New projects and repositories created or cloned by Space Zero use `Space Zero Home/projects` by default. Existing repositories may remain at external paths and are registered without being moved. The Knowledge Base remains separate under `Space Zero Home/knowledge-base`.
- New sessions should start from a workspace-global default model and default thinking level defined in Space Zero Settings. A session may override both independently. Per-project default model/thinking is a v1 enhancement with project settings, not v0.
- LLM provider credentials and the model catalog are owned by Pi in the utility, not mirrored in SQLite. Renderer Settings/Model UI brokers to the utility through main over `window.spacezero`. OAuth providers are supported from day one via the OS browser plus a `spacezero://` deep link handled by main.
- Skills use `<Space Zero Home>/skills` as the native global location and also support `~/.agents/skills`, project `.agents/skills`, and project `.pi/skills`. Project skills take precedence over global skills after a persisted project-trust decision; without one, project-local skill discovery fails closed. The chat composer exposes available skills through `/skill:name` discovery while Pi owns command expansion. Settings provides global-skill enable/disable controls for the Space Zero Home and `~/.agents/skills` locations; disabled global skills are excluded from new or reloaded agent sessions, while project-local skills remain project-scoped.
- Meaningful user actions should be implemented as application capabilities that can be reached by the renderer UI and, when appropriate, exposed as Workspace Tools for agents.
- The Command Palette should be a searchable mini Raycast-like UI inside Space Zero over the App Command Registry, not a place where command behavior is implemented directly.
- App commands should have stable IDs, user-facing titles, categories, optional search keywords, optional default keyboard shortcuts, and handlers or invocation targets.
- App commands may include both navigation/UI commands and app-state commands. Renderer-local UI commands may stay in renderer code; privileged or persisted app-state commands must go through `window.spacezero`, preload, typed IPC, and main-process application services.
- The Command Palette itself is renderer-owned UI. It owns presentation, search, keyboard interaction, and selection state, not privileged app behavior.
- The v0 App Command Registry should be generic to the app and does not need context-aware command availability. Context-aware commands, such as commands depending on the current project, session, selection, or focused panel, are a later enhancement.
- Workspace Tools should be designed as reusable internal application capabilities, but v0 exposes them only to the in-app Agent Workspace. External automation surfaces such as a CLI, MCP server, local socket, or public API are future possibilities, not v0 commitments.
- Space Zero has two session kinds: **Project Sessions** (triggered from a Project, run with that project's context and cwd) and **Workspace Sessions** (global, spawnable at any time, e.g. from the Command Palette, with no required project context). Both are built from the same reusable Chat Components and backed by one Pi `AgentSession` each. Project Sessions use Pi's built-in project tools against the project cwd; Workspace Sessions primarily use Workspace Tools.
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
| Pi | Default agent harness. | Integrated via the `@earendil-works/pi-coding-agent` SDK, in-process, inside an Electron utility process. The renderer never imports Pi, never spawns the Pi CLI, and never holds a direct channel to the utility. Main brokers all renderer↔agent traffic over typed `window.spacezero` IPC plus a `MessagePort` to the utility. The utility owns the agent loop, LLM streaming, transcript, and Pi's built-in project tools. `@earendil-works/pi-tui` and `@earendil-works/pi-orchestrator` are not used. See `docs/adr/0006-pi-agent-harness-in-utility-process-via-sdk.md`. |
| Git CLI | Local repository operations. | Main process should own child-process execution and validation. |
| GitHub API / Octokit | GitHub account, issues, PRs, checks, workflow runs, comments, and status sync. | Credentials must be stored safely and not exposed to renderer code. |
| SQLite | Local app persistence. | Lives in main process behind typed IPC APIs. |
| Chromium/Electron | Desktop shell, renderer runtime, and future embedded preview/debug surface. | Preserve secure Electron defaults. |
| shadcn Chat Components | Conversation container UI for agent chat (scroll, message rows, bubbles, markers). | shadcn registry (June 2026) — copied source. `MessageScroller` owns anchored streaming, saved-thread restore, prepend history, jump-to-message as a headless tested primitive (`@shadcn/react`). Native to Space Zero's shadcn/Tailwind v4/Base UI setup. See `docs/adr/0007-...md`. |
| AI Elements | AI-specific and IDE-specific UI components (tool, confirmation, model-selector, reasoning, prompt-input, and future file-tree, terminal, commit, code-block, web-preview, test-results, stack-trace). | shadcn registry by Vercel — copied source, not an npm dependency. Presentational (props/callbacks, no runtime). Components adapted: AI SDK type imports replaced with Space Zero types, lucide icons swapped for Phosphor. See `docs/adr/0007-...md`. |

## Decisions and References

- `docs/adr/0001-use-electron-for-the-desktop-shell.md`
- `docs/adr/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/0003-store-local-app-state-in-sqlite-from-the-main-process.md`
- `docs/adr/0004-adopt-process-aware-feature-modules.md`
- `docs/adr/0005-use-workspace-tools-as-the-agent-application-control-plane.md`
- `docs/adr/0006-pi-agent-harness-in-utility-process-via-sdk.md`
- `docs/adr/0007-ui-component-base-shadcn-chat-and-ai-elements.md`
- `docs/adr/0009-user-configurable-space-zero-home.md`
- `docs/adr/0010-use-agent-skills-from-space-zero-and-standard-scopes.md`
- Engineering rules: `docs/engineering/`

## Maintenance Rules

- Update this file when durable product language changes.
- Do not store temporary implementation plans here; use GitHub Issues for specs and tasks.
- Do not duplicate coding doctrine here; use `docs/coding-standards.md` and `docs/engineering/`.
