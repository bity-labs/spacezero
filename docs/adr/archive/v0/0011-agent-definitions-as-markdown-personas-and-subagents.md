---
title: Agent Definitions as Markdown Personas and Subagents
---

## Status

Accepted

## Context

Space Zero sessions are configured per session: each starts from a workspace-global default model and thinking level and may override both (`docs/adr/archive/v0/0006-pi-agent-harness-in-utility-process-via-sdk.md`). There is no way to capture a reusable agent setup — a role, its instructions, its model, its tool surface — and apply it repeatedly.

Builders need exactly that, in two situations:

1. **Starting a session with a role** — the same way they pick a model, they want to start a session as a "reviewer" or a "researcher" with fitting instructions, model, thinking level, and tools.
2. **Delegating work mid-session** — a running session should be able to hand a task to a specialist agent and get its result back.

Prior decisions constrain the shape:

- `docs/adr/0006` — Pi runs in a utility process; Space Zero composes Pi resources programmatically and keeps Pi's broad auto-discovery disabled; the utility holds a `Map<sessionId, AgentSession>` with many sessions live concurrently.
- `docs/adr/archive/v0/0005-use-workspace-tools-as-the-agent-application-control-plane.md` — agents operate Space Zero app state through Workspace Tools routed into main-process application services.
- `docs/adr/archive/v0/0009-user-configurable-space-zero-home.md` — user-owned Space Zero resources live under a configurable Space Zero Home.
- `docs/adr/archive/v0/0010-use-agent-skills-from-space-zero-and-standard-scopes.md` — reusable agent resources are markdown discovered from layered scopes (project `.agents/…`, Space Zero Home, `~/.agents/…`) with most-specific-wins precedence and collision diagnostics.

The Pi SDK already supports per-session model, thinking level, tool allowlists, custom tools, and system-prompt composition (including `appendSystemPrompt`) — but has no subagent primitive. The oh-my-pi fork (`github.com/can1357/oh-my-pi`) demonstrates a proven subagent contract on the same foundations: markdown agent definitions with YAML frontmatter, a `task` delegation tool with per-item agent selection, `spawns` nesting policy, structured output schemas, async spawns, and worktree isolation.

## Decision

Space Zero supports **Agent Definitions**: reusable, named agent configurations stored as markdown files with YAML frontmatter. The file body describes the agent's role and goal.

### File format

- The **filename is the stable ID** (`code-reviewer.md` → `code-reviewer`); frontmatter `name` is the display label.
- **`description` is required.** It is shown in the picker and read by delegating agents to choose a definition.
- **`model`** (`providerId/modelId`) and **`thinking`** are optional and fall back to workspace defaults. When a definition is selected for a session, they override the workspace-global defaults.
- **`tools`** is an optional allowlist spanning both tool domains (Pi project tools and Workspace Tool names). Absent means the session-kind default tool set.
- **`spawns`** is an optional nesting policy: a CSV list of definition IDs or `*`. Default is none — a definition's child runs may not delegate further.
- **`output` and `blocking` are reserved** for future releases. Files using them are rejected at scan time with an explicit not-yet-supported diagnostic, so today's parser never silently misinterprets tomorrow's files.
- Unknown fields are ignored with a soft diagnostic, keeping the format forward-compatible.

### Discovery

Definitions are discovered from four scopes, mirroring ADR 0010 skill discovery:

1. **project** — `<repo>/.agents/agents/*.md`, walking up from the session cwd, trusted projects only; committable and team-shared.
2. **spacezero** — `<Space Zero Home>/agents/*.md`, following the user-configured home.
3. **user** — `~/.agents/agents/*.md`.
4. **bundled** — defaults shipped inside the app (a read-only `scout` researcher and a `reviewer`), so delegation is useful immediately and users have reference examples.

On ID collision the most specific scope wins: project > spacezero > user > bundled. Unlike skills, definitions have no enable/disable toggles — they are chosen explicitly, not loaded ambiently.

Discovery is contextual. Global Settings has no Project Session identity or cwd, so its read-only Agents section scans only the spacezero, user, and bundled scopes and shows shadowing and diagnostics within that global catalog. It must not borrow a last-active project or invent an implicit project context. Project definitions are discovered only for a trusted Project Session from that Session's cwd and appear in session-contextual definition surfaces. Persisted project trust and contextual project-definition diagnostics must exist before project-scope definitions are exposed; they are not inferred from repository registration or managed-worktree ownership. Issue #186 tracks that prerequisite.

### Two usage modes

- **Persona mode.** A definition picker sits in the chat input next to the model selector, enabled only while a session is fresh (before its first prompt). The selection locks once the session starts; model and thinking remain overridable afterwards. The body is **appended** to Pi's base system prompt.
- **Subagent mode.** Sessions with definitions in scope get a built-in **`agents.delegate`** tool. Its input is `{ definition, task }`; a catalog of available definitions (id, name, description) is appended to the session's system prompt so the agent knows when to delegate.

### Subagent runs

Delegation spawns a child Pi `AgentSession` in the utility with fresh context (never the parent transcript), inheriting the parent's cwd and session kind, configured from the definition. The body is **wrapped in subagent framing** (you are a delegated agent; you start with no conversation context; report your result as your final message) rather than appended verbatim.

The call is **blocking**: the parent's tool call waits and receives the child's final message as a structured result object (`{ status, output }`). Errors and aborts surface as structured error results to the parent agent. Aborting or deleting a parent session aborts its in-flight child runs. Child runs render as tool calls in the parent transcript and get no sidebar session. `agents.delegate` is a Pi custom tool registered **inside the utility process, not a Workspace Tool**: child-session spawning is agent-runtime orchestration owned by the utility, and routing it through main would be circular (utility → main → utility).

### Validation posture

Discovery is lenient and diagnostic-driven: invalid global files are skipped with reasons surfaced in the read-only Settings "Agents" section, while project-file diagnostics belong to a trusted Project Session context. Using a definition is loud: unknown models, empty effective tool allowlists, and reserved fields fail with explicit errors and never silently reinterpret the author's intent.

### Deferred, designed for

Structured `output` schemas with typed results, async/background spawns, batch `tasks[]`, worktree isolation, model fallback lists, and live subagent progress UI are **not built**. Each is tracked in a follow-up enhancement issue, and v0 keeps the door open through the reserved fields, the structured result shape, and per-child `parentSessionId` bookkeeping.

## Rationale

Markdown files — not SQLite — because definitions are user-authored documents that benefit from being committable to project repositories (team-shared agents) and from the cross-tool `.agents/` convention, exactly as ADR 0010 found for skills.

Mirroring skill discovery gives one code shape and one mental model for reusable agent resources, follows the configurable Space Zero Home (ADR 0009), and inherits the trust and precedence semantics already established.

The delegation tool lives in the utility because ADR 0005's control plane governs operations on Space Zero app state. Delegation does not operate app state — it orchestrates agent runtime, like Pi's built-in project tools. Making it a Workspace Tool would force a circular route and buy no safety property, since the child session's own tools remain governed by their existing domains and policies.

Blocking v0 semantics keep the agent loop simple: async delivery would require injecting results into a running parent mid-turn and extending the projection sequencer across sessions. That can be relaxed later without breaking behavior, whereas shipping async first and retracting it would break sessions people rely on.

Appending or wrapping the body — never replacing the base system prompt — preserves Pi's tool-use conventions. omp's own executor wraps agent bodies in a subagent template inside the default prompt stack for the same reason.

The lean v0 contract deliberately reserves omp's field names (`output`, `blocking`, `spawns`) instead of inventing divergent ones, so definitions written for future Space Zero versions — or ported from omp-style conventions — fail loudly today and work unchanged tomorrow.

## Consequences

- A new main-process `agents` feature module owns discovery, parsing, validation, and Settings IPC for definitions, following the feature-module layout of ADR 0004.
- Session creation accepts a definition reference; the resolved definition (body, model, thinking, tool allowlist) is passed into the utility, consistent with programmatic composition in ADR 0006.
- The utility gains a child-session lifecycle: spawn from a definition, block the parent's tool call, return structured results, cascade aborts, and record `parentSessionId` for future async and progress work.
- The renderer gains a definition picker in the chat input (fresh sessions only), an active-definition chip, and a read-only global Settings "Agents" section for spacezero, user, and bundled definitions with diagnostics and shadowing. Project definitions and their diagnostics require a trusted Project Session context.
- Live sessions do not hot-reload definition changes, matching the skill lifecycle rule in ADR 0010.
- Child runs are invisible in the sidebar for now; the follow-up progress-UI issue owns that surface.
- Follow-up work: six enhancement issues (structured output, async spawns, batch delegation, worktree isolation, model fallback lists, live progress UI), each stating what v0 must not preclude.

## Alternatives Considered

- **Store definitions in SQLite.** Rejected: not committable or shareable through git, and breaks the markdown resource convention established for skills.
- **Enable Pi's native resource auto-discovery for agents.** Rejected: Space Zero controls the capability surface through explicit programmatic composition (ADR 0006); scope, trust, and precedence are application policy, not Pi defaults.
- **Adopt the full omp subagent contract in v0** (structured output, async spawns, batch, isolation, model lists). Rejected: roughly triples the feature's size; worktree isolation alone is a feature of its own, and async delivery changes agent-loop semantics through the projection pipeline. Reserved fields keep forward compatibility instead.
- **Delegation as a Workspace Tool routed through main.** Rejected: circular (utility → main → utility) with no safety gain; child sessions are agent-runtime work, not app-state operations.
- **Full system-prompt replacement by the definition body.** Rejected: risks losing Pi base tool-use conventions; append/wrap preserves them.
- **Free nesting without a policy field.** Rejected: `spawns` defaults closed so delegation graphs stay predictable; opting in is explicit per definition.

## Review Trigger

Revisit this decision if:

- Pi ships native subagent support that makes the utility-owned child lifecycle redundant.
- The deferred structured-output or async-spawn work lands and shows the blocking, prose-result model to be the wrong default rather than a simplification.
- Delegation needs to affect Space Zero app state, which would require re-routing through the Workspace Tool layer per ADR 0005.
- Builders need definition changes to apply to live sessions, breaking the lifecycle rule shared with skills.
- Shadowing and precedence prove confusing in practice, requiring a different collision policy than most-specific-wins.
