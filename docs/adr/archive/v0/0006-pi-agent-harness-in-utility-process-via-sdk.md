---
title: Pi Agent Harness in a Utility Process via the SDK
---

## Status

Accepted

> Amended by ADR 0020: user-facing ordinary Workspace Sessions are replaced by one Global Chat, and Space Zero distinguishes stable workspace contexts from rotatable Chat Contexts.

## Context

Space Zero is a Pi-first agentic desktop workspace. `docs/context.md` fixes Pi as the v0 agent harness and states that future agent sessions should be orchestrated from main/utility process code, not renderer code.

Prior decisions constrain how Pi may be integrated:

- `docs/adr/archive/v0/0001-use-electron-for-the-desktop-shell.md` — Electron is the v0 desktop shell.
- `docs/adr/archive/v0/0002-secure-electron-process-boundaries-and-typed-ipc.md` — renderer is UI only; preload exposes the only renderer-facing desktop API as `window.spacezero`; privileged work crosses typed IPC into main.
- `docs/adr/archive/v0/0003-store-local-app-state-in-sqlite-from-the-main-process.md` — SQLite and app persistence live in main behind typed IPC.
- `docs/adr/archive/v0/0005-use-workspace-tools-as-the-agent-application-control-plane.md` — agents operate the app through typed Workspace Tools that route into main-process application services; no backdoors into SQLite, IPC, or renderer internals.

The Pi project is a monorepo (`@earendil-works/pi-*`) with five packages. The relevant surface for Space Zero is:

- `@earendil-works/pi-ai` — unified multi-provider LLM API with auth, tool-calling, token/cost tracking.
- `@earendil-works/pi-agent-core` — stateful agent runtime and `AgentHarness` with session persistence, branching, compaction, steering/follow-up queues, and event streaming.
- `@earendil-works/pi-coding-agent` — interactive coding agent with a Node.js/TypeScript SDK (`createAgentSession`, `AgentSession`, `SessionManager`, `SettingsManager`, `ModelRegistry`, `AuthStorage`, `DefaultResourceLoader`, `defineTool`/`customTools`), plus CLI, interactive TUI, print, and RPC modes.

Two Pi packages are out of scope for Space Zero:

- `@earendil-works/pi-tui` — terminal UI framework. Space Zero is a desktop GUI, not a terminal app.
- `@earendil-works/pi-orchestrator` — experimental and explicitly unstable.

Space Zero must run multiple agent sessions concurrently in the background so a builder can start work in one session, switch to another, give it different work, and have both keep streaming.

## Decision

Space Zero integrates Pi via the **`@earendil-works/pi-coding-agent` SDK, in-process, inside an Electron utility process**. The renderer never imports Pi, never spawns the Pi CLI, and never holds a direct channel to the utility process.

The integration has four parts:

### 1. SDK in a utility process, not the main process

The Pi SDK runs inside an Electron utility process. The utility process owns the agent loop, LLM streaming, conversation transcript, and Pi's built-in project tools. Running Pi in a utility process keeps LLM streaming and tool execution off the main thread so the window does not jank. Main spawns the utility over `utilityProcess.fork()` and communicates with it over a `MessagePort`.

### 2. Main process as broker for renderer ↔ agent traffic

The renderer's Agent Workspace surface communicates with the agent exclusively through typed IPC via `window.spacezero`. Main brokers every command and event between the renderer and the utility process. The renderer never receives a direct `MessagePort` to the utility.

The shape is:

```
Renderer (Agent Workspace UI)
   |  window.spacezero.agent.* (typed, via preload)
   v  ipcRenderer.invoke / ipcRenderer.on
Main process  -- broker: validate, route, safety policy, activity history
   |  MessagePort (main <-> utility)
   v
Utility process -- Pi SDK AgentSession (pi-ai + pi-agent-core + pi-coding-agent)
                   built-in project tools + Space Zero Workspace Tools (customTools)
```

Every agent event streamed to the renderer is tagged with the `sessionId` it belongs to, so each Agent Workspace panel renders its own live state and the session list can show running/idle status for all live sessions. Every `agent:*` IPC command carries `sessionId` so main forwards it to the correct utility-side session.

### 3. Dual tool domains in one AgentSession

Each `AgentSession` carries two distinct tool domains:

- **Project tools (Pi built-in).** `bash`, `edit`, `write`, `read`, `grep`, `find`, `ls` run entirely inside the utility process against the active project working directory. This is the builder's agent operating on their repository. Main does not intercept these unless an optional Pi extension hook is added later (for example, confirm before `rm -rf`); such hooks are not a v0 commitment.
- **App tools (Space Zero Workspace Tools).** Workspace Tools are registered as additional Pi custom tools (`customTools` / `defineTool`) in the same `AgentSession` tool list. They operate Space Zero itself and route into main-process application services. Their `execute()` in the utility is a **thin proxy** that sends a typed request `{ sessionId, toolName, input, safetyLevel, callId }` to main over the `MessagePort` and awaits the response. The real handler, validation, safety policy, Agent Activity History, and UI dispatch all run in main, exactly as `docs/adr/0005` requires. The utility never holds the real Workspace Tool handler.

The Workspace Tool Registry is main-owned. When composing a session's tool list, the utility receives serializable tool descriptors plus proxy `execute()` stubs, never the handlers.

### 4. One Pi AgentSession per Space Zero Session, many live concurrently

> Amended by ADR 0020. This section describes the original v0 runtime mapping. The current product model distinguishes stable workspace contexts from rotatable Chat Contexts, so implementation must not assume a user-facing one-to-one relationship between Space Zero workspace containers and chat transcripts.

The utility process holds a `Map<sessionId, AgentSession>`. There is one Pi `AgentSession` per Space Zero Session, each with its own `SessionManager`, model, thinking level, and active tool list. Multiple sessions run concurrently and in the background; switching the active session is a UI focus concept, not a runtime limit. Inactive sessions are persisted and rehydrated via `SessionManager.continueRecent` / `open` when the builder returns to them.

A resource cap on concurrent live sessions (memory, CPU, LLM-stream budget) is a tunable, not an architectural constraint. Sessions above the cap stay persisted until summoned.

### Workspace Tool confirmation

Workspace Tool confirmation is agent-initiated and rendered in-session inside the Agent Workspace panel, not a floating app modal. When the Workspace Tool Safety Policy requires confirmation for a tool call, main emits an `agent:toolConfirmationRequest` (with `sessionId`, `callId`, tool name, and a sanitized summary of what the tool will do) to the renderer, which renders it inline in that session's Agent Workspace. The builder answers via `agent:resolveToolConfirmation` (`callId`, `approved`). The agent turn is paused mid-tool-call until the builder answers. Each Workspace Tool may declare how to render its confirmation summary; v0 may start with a generic summary and improve per-tool later.

### Auth, models, and per-session selection

Pi owns LLM provider credentials and the model catalog inside the utility process. Space Zero does **not** mirror credentials or models in SQLite for v0.

- **Credentials** live in Pi `AuthStorage` at `<appData>/spacezero/agent/auth.json` in the utility. Pi already handles file locking across processes, `0600` permissions, env-var fallback, and in-lock OAuth token refresh. Reimplementing that against SQLite would duplicate risk for no v0 product benefit. LLM credentials are agent-runtime state, not core app state (ADR 0003 covers app state such as projects, sessions, and app metadata), so they stay with the agent runtime. GitHub credentials remain a separate Octokit system in main, unrelated to Pi auth.
- **Models** come from one shared Pi `ModelRegistry` in the utility, shared across all live `AgentSession`s. The model *catalog* is workspace-global; only the *selected* model differs per session. Custom-model `models.json` lives in the agent dir. v0 ships the built-in provider catalog; user-defined custom providers are deferred (tracked in a follow-up enhancement issue) but the broker/registry shape must not preclude them.
- **Per-session selection.** Each `AgentSession` holds its own `model` + `thinkingLevel`, set via Pi's `setModel()` (which validates auth first). New sessions start from the **workspace-global default model + default thinking level** defined in Space Zero Settings. A session may then override both independently. Per-project default model/thinking is a v1 enhancement with project settings, not v0.
- **Renderer Settings/Model UI brokers to the utility through main** over the same `MessagePort`: `agent:addApiKey`, `agent:removeApiKey`, `agent:getAuthStatus`, `agent:getAvailableModels`, `agent:setModel { sessionId, provider, modelId }`, `agent:setThinkingLevel`, `agent:testAuth`, `agent:loginOAuth`, `agent:logoutOAuth`. The renderer never sees `auth.json` or `models.json` and never touches credentials directly, preserving ADR 0002.
- **OAuth from day one.** Pi's OAuth providers (GitHub Copilot, Vertex AI, Anthropic OAuth, etc.) are supported in v0. The utility cannot open a browser itself, so the flow is: utility requests OAuth via the `MessagePort` → main opens the OS default browser to the provider authorize URL → the provider redirects to a Space Zero custom-scheme deep link (`spacezero://oauth/…`) → Electron's `app.on('open-url')` (with `setAsDefaultProtocolClient`) routes the callback into main → main forwards the callback to the utility → Pi `AuthStorage` completes the token exchange and persists it. This mirrors how other desktop apps do OAuth; no embedded browser is used.
- **v0 provider scope:** built-in API-key providers and built-in OAuth providers. User-defined custom providers (for example local Ollama via an OpenAI-compatible endpoint) are explicitly out of v0 scope but must be designed for; tracked in a follow-up enhancement issue.

### Persistence and source-of-truth split

Pi's `SessionManager` / `SettingsManager` / `DefaultResourceLoader` are used only inside the utility process for the agent's own conversation transcript and runtime config. They are not the source of truth for Space Zero's project/session model. Space Zero's SQLite (per ADR 0003) owns the higher-level project ↔ session ↔ branch metadata and the link to the Pi transcript path. Pi's session storage is the source of truth only for the agent transcript.

Pi's broad auto-discovery of extensions, prompt templates, and themes from `~/.pi` and `.pi` is not used for v0 composition. Agent Skills are the exception: Space Zero explicitly composes approved native and standard skill directories and uses Pi's native `/skill:name` expansion. Space Zero registers Workspace Tools and any Pi extensions programmatically via the SDK so the app controls exactly what the agent can do. See `docs/adr/archive/v0/0010-use-agent-skills-from-space-zero-and-standard-scopes.md`.

## Rationale

The SDK preserves type safety, direct `AgentSession` state access, and programmatic tool registration without a serialization hop. Since Space Zero is already a Node.js/Electron TypeScript app, the RPC subprocess mode would add a JSON marshalling layer over every event and tool call for no v0 benefit. RPC remains a clean future fallback if Space Zero later wants to run untrusted extensions in a sandbox.

The utility process keeps agent CPU and LLM streaming off the main thread, preserving window responsiveness while staying in-process (no CLI spawn, no IPC protocol to reimplement).

Main-as-broker is required by the existing security model, not a preference. `docs/adr/0002` requires the renderer to cross preload/IPC for privileged behavior, and `docs/adr/0005` requires Workspace Tools to route through main-process application services with validation, safety policy, and activity history. A direct renderer ↔ utility `MessagePort` would bypass main and break that contract. Main as broker does not mean main doing agent work; main only marshals, validates, and routes.

Dual tool domains reflect a real distinction. Pi's built-in tools operate the builder's repository (the project layer), which is what a coding agent is for. Workspace Tools operate Space Zero itself (the app layer) and must stay under the safety policy. Keeping both in one `AgentSession` lets the agent work across both domains in a single turn while keeping their execution homes separate: project tools run in the utility, Workspace Tool handlers run in main via a proxy.

Proxy `execute()` for Workspace Tools enforces the boundary mechanically: the utility cannot bypass safety policy because it does not have the handler. The handler, validation, confirmation, and activity history all live in main, exactly where ADR 0005 places them.

One `AgentSession` per Space Zero Session matches Pi's single-conversation design and `docs/context.md`'s first-class sessions. Multiple live sessions satisfy the product thesis: a builder should be able to run parallel agent work in the background and see live sessions in a dedicated app surface. The active session is a UI focus concept, not a runtime limit.

Agent-initiated in-session confirmation matches the user's mental model: the agent asks, the builder answers, the turn continues. It is driven by the existing Workspace Tool Safety Policy rather than a separate UI system.

## Consequences

- The renderer stays Pi-free. All agent access is through `window.spacezero` typed IPC brokered by main.
- Main owns a `MessagePort` to the utility process and a routing layer that tags every agent event and command with `sessionId`.
- The utility process owns a `Map<sessionId, AgentSession>` and a resource cap for concurrent live sessions.
- Workspace Tool definitions live in main; the utility receives only descriptors and proxy stubs. New Workspace Tools must be added to the main-owned registry.
- Pi's built-in project tools run unintercepted in the utility in v0. Optional gating via Pi extension hooks is a later enhancement.
- Pi's broad `~/.pi` / `.pi` auto-discovery for extensions/prompts/themes is disabled in v0. Skill directories are explicitly composed by Space Zero as described in ADR 0010. Tool and extension composition is programmatic via the SDK.
- LLM credentials and the model catalog are owned by Pi in the utility (`auth.json` / `models.json` under the Space Zero agent dir), not mirrored in SQLite. New sessions default to the workspace-global default model + thinking level; sessions override per-session. Per-project defaults are a v1 enhancement. OAuth is supported from day one via OS browser + `spacezero://` deep link routed through main. User-defined custom providers are deferred to a tracked enhancement issue.
- Pi session/settings/resource internals are not the source of truth for Space Zero projects/sessions. Space Zero SQLite links to Pi transcript paths instead.
- Agent Activity History is recorded in main for Workspace Tool calls only; project-tool activity is Pi's own concern unless a future hook is added.
- The Agent Workspace UI must render in-session tool confirmation requests keyed by `sessionId` and `callId`.
- Follow-up work: a `MessagePort` framing protocol between main and the utility, a `sessionId`-tagged event/command type set in `src/shared`, a main-owned Workspace Tool Registry with proxy descriptor generation, a utility-side session lifecycle manager, a concurrent-session resource cap, a `spacezero://` deep-link handler for OAuth callbacks, a workspace-global default model/thinking setting backed by Space Zero Settings, and renderer Settings/Model UI that brokers to the utility.

## Alternatives Considered

- **Pi CLI in RPC subprocess mode.** Rejected for v0 because Space Zero is a Node.js/TypeScript app and RPC would add a JSON marshalling layer over every event and tool call with no benefit. RPC remains a viable future fallback for sandboxed/isolated agent execution.
- **Pi SDK in the main process.** Rejected because LLM streaming and tool execution on the main thread would jank the window. The utility process isolates agent work while staying in-process.
- **Direct renderer ↔ utility `MessagePort`.** Rejected because it bypasses main-process validation, safety policy, and activity history, breaking ADR 0002 and ADR 0005. Main must remain in the path for any app-state or privileged behavior.
- **Replace Pi's built-in `bash`/`edit`/`write` with Workspace Tools.** Rejected because those tools operate the builder's repository (the project layer), which is legitimate coding-agent work. The "no backdoors" rule applies to Space Zero app internals, not to the user's project files. Project tools and Workspace Tools are two distinct domains in one `AgentSession`.
- **A single shared Pi `AgentSession` for the whole app.** Rejected because it would collapse all projects/tasks into one transcript and contradict first-class Project Sessions. ADR 0020 later preserves this concern through separate Chat Contexts scoped to stable workspace contexts rather than ordinary global Workspace Sessions.
- **One live session at a time in v0.** Rejected because parallel background agent work is core to the product thesis, not a later optimization. Pi's independent `AgentSession` design supports this naturally.
- **Broad Pi resource auto-discovery for extensions/prompts/themes in v0.** Rejected for v0 to keep the agent's capability surface fully controlled by Space Zero. Agent Skills use an explicit, standards-compatible path composition described in ADR 0010.
- **`@earendil-works/pi-tui`.** Out of scope; Space Zero is a desktop GUI.
- **`@earendil-works/pi-orchestrator`.** Out of scope; explicitly experimental and unstable.

## Review Trigger

Revisit this decision if:

- Pi's SDK API changes in a way that breaks in-process embedding or programmatic tool composition.
- Space Zero needs to run untrusted agent extensions and wants process isolation, making RPC subprocess mode or a sandbox attractive.
- The concurrent live-session resource cap proves insufficient and the architecture needs first-class multi-session resource scheduling.
- Pi's `AgentHarness` durability/recovery work matures enough that Space Zero wants to rely on it instead of Space Zero SQLite for session metadata.
- Workspace Tool confirmation needs multi-step approval flows or per-project safety policies.
- A future decision exposes Workspace Tools to external automation surfaces (CLI, MCP, local socket, public API), which would change the brokered IPC shape.
