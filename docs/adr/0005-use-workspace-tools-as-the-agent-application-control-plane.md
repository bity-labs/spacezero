---
title: Use Workspace Tools as the Agent Application Control Plane
---

## Status

Accepted

## Context

Space Zero is an agentic desktop workspace. It will let builders manage projects, sessions, settings, previews, GitHub workflows, and agent work from one GUI. The app should also include an Agent Workspace where a builder can ask an agent to inspect and operate the application itself, such as checking session status, creating a project, opening a webpage in the preview surface, or changing settings.

These capabilities are powerful because they can mutate local app state, touch local repositories, orchestrate sessions, and control desktop UI. Existing decisions require strict Electron process boundaries and typed IPC:

- `docs/adr/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/0003-store-local-app-state-in-sqlite-from-the-main-process.md`
- `docs/adr/0004-adopt-process-aware-feature-modules.md`

The agent must not receive backdoors into SQLite, renderer internals, raw IPC, filesystem access, or privileged app internals. At the same time, features should be built so meaningful app capabilities can be reached by both human UI flows and agent-driven flows without duplicating business logic.

## Decision

Space Zero uses **Workspace Tools** as the agent-facing application control plane.

A Workspace Tool is a typed capability that lets an agent inspect or operate Space Zero through approved application behavior. Workspace Tools route into the same main-process application services used by renderer IPC handlers. Agents must not directly mutate SQLite, bypass validation, call arbitrary internal functions, or manipulate renderer internals.

The user-facing product surface is called the **Agent Workspace**. The internal architecture concept is the **Workspace Control Plane**. The approved catalog of callable agent tools is the **Workspace Tool Registry**.

Workspace Tools follow these rules:

- Tools are exposed through an explicit Workspace Tool Registry passed to the agent harness.
- Each tool declares a name, input schema, safety level, category/kind metadata, and handler.
- Safety levels include at least `read`, `write`, and `dangerous`.
- Confirmation requirements are controlled by a global Workspace Tool Safety Policy setting.
- Defaults should be conservative, but users may allow write or dangerous tools without confirmation.
- Tool results return structured data only, not polished conversational summaries.
- Each feature owns its tool definitions near its main-process services, for example `projects.tools.ts` beside `projects.service.ts`.
- The Agent Workspace or Workspace Control Plane composes feature-owned tools into the registry given to Pi.
- Renderer IPC handlers and Workspace Tool handlers are separate entrypoints, but both must call the same main-process application services for the underlying use cases.
- Tools are grouped by product domain, such as `projects`, `sessions`, `settings`, `preview`, `workspace`, and `ui`.
- Composed tools such as `workspace.getStatus` are allowed when there is a clear product need, but aggregate tools should not be created speculatively.
- Workspace Tools may include app-state actions and UI-control actions.
- UI-control tools still enter through the main-process tool layer; main validates, applies safety policy, records activity when appropriate, and sends typed UI commands/events to the renderer.
- Space Zero keeps a lightweight Agent Activity History for Workspace Tool calls, focused on visibility and debugging rather than compliance auditing.

The v0 exposure target is only the in-app Agent Workspace. Workspace Tools should be designed as reusable internal application capabilities, but external automation surfaces such as CLI, MCP, local socket, or public API are not v0 commitments.

## Rationale

This keeps agent control powerful without creating unsafe shortcuts.

Routing tools into main-process application services preserves the Electron security boundary and keeps SQLite, filesystem, child processes, credentials, Git/GitHub, and agent orchestration out of the renderer and out of direct agent reach.

Sharing application services prevents duplicate implementations. A human clicking a settings control and an agent calling `settings.update` should execute the same validated use case. This makes behavior more consistent, easier to test, and easier to reason about.

An explicit registry matches the agent tool model used by Pi and gives Space Zero one place to expose approved capabilities, validate inputs, enforce safety policy, and record lightweight activity history.

A global safety policy balances safety and user autonomy. Cautious users can require confirmation for writes or dangerous operations. Power users can allow dangerous tools without confirmation.

Structured-only tool results keep the tool protocol clean. Agents can interpret and summarize results in conversation, while Space Zero can separately record lightweight activity metadata.

## Consequences

- New meaningful app capabilities should be implemented as main-process application services that can be reached from renderer IPC and, when appropriate, Workspace Tools.
- Agent-facing behavior requires explicit tool definitions instead of ad hoc function exposure.
- Features that expose tools need schemas, safety levels, metadata, and handlers.
- The Agent Workspace needs a registry composition layer that collects feature-owned tools for Pi.
- The settings feature needs a global Workspace Tool Safety Policy.
- Space Zero needs lightweight Agent Activity History persistence or storage before tool activity can be reviewed.
- UI-control actions need typed main-to-renderer command/event channels instead of direct renderer manipulation.
- Some implementation work is more verbose, but the resulting boundaries are safer and easier to audit.

## Alternatives Considered

- Direct database access for agents — rejected because it bypasses validation, business rules, migrations, safety policy, activity history, and Electron process boundaries.
- Direct renderer/UI automation for first-class app actions — rejected because it is brittle, hard to secure, and couples agent behavior to presentation details.
- Expose raw IPC or arbitrary internal functions to agents — rejected because it is difficult to validate, audit, document, and constrain.
- Build separate agent-only business logic — rejected because it would drift from human UI behavior and create two implementations of the same use cases.
- Create public external automation APIs in v0 — rejected as premature. Tools should be reusable internally, but v0 only exposes them to the in-app Agent Workspace.
- Require confirmation for every dangerous action unconditionally — rejected because Space Zero should support power users who intentionally allow agents to operate without confirmation.

## Review Trigger

Revisit this decision if:

- Pi's tool model changes in a way that makes the registry approach unsuitable.
- Space Zero exposes Workspace Tools to external automation surfaces such as CLI, MCP, local sockets, or public APIs.
- Multi-agent or multi-user workflows require per-project, per-agent, or role-based safety policies.
- UI-control tools become complex enough to require a dedicated renderer command architecture ADR.
- Activity history requirements grow from lightweight visibility/debugging into compliance-grade auditing.
