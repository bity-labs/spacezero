# Adding Workspace Tools

Workspace Tools are the approved, typed capabilities that agents call to inspect
or operate Space Zero through the Workspace Control Plane. Agents never touch
SQLite, raw IPC, the filesystem, or renderer internals directly; they call tools
that route into the same main-process application services used by the renderer
UI.

This guide explains how a feature exposes Workspace Tools. It implements the
decision in `docs/adr/0005-use-workspace-tools-as-the-agent-application-control-plane.md`.

## Concepts

- **Workspace Tool** — a typed capability: a stable dotted name, a zod input
  schema, a safety level (`read`, `write`, or `dangerous`), a kind
  (`app-state` or `ui-control`), a domain, a description, and a handler.
- **Workspace Tool Registry** — the approved catalog of tools composed from
  feature-owned definitions and handed to the agent harness.
- **Workspace ToolSafety Policy** — the global policy that decides whether
  write or dangerous tools require confirmation before they run.
- **Agent Activity History** — lightweight records of tool calls for visibility
  and debugging. It stores metadata only, never full input or output payloads.
- **Tool result** — structured data only. Tools never return polished
  conversational summaries; the agent summarizes results in conversation.

## Where tools live

Each feature owns its tool definitions **near its main-process application
services**:

```txt
src/features/projects/main/
├── projects.service.ts      # application/use-case logic shared with IPC
├── projects.ipc.ts          # renderer-facing ipcMain handlers
└── projects.tools.ts        # agent-facing Workspace Tools
```

Tool handlers must call the same `*.service.ts` application services used by
`*.ipc.ts`. Do not duplicate business logic inside tools, and do not call
ad-hoc internal helpers, repositories, or the database directly from a tool
handler. The application service is the single place that owns the use case.

A tool file exports an array of owned tools:

```ts
// src/features/projects/main/projects.tools.ts
import { z } from 'zod'

import { defineWorkspaceTool } from '../../agent-workspace/main'
import type { AnyWorkspaceTool } from '../../agent-workspace/main'
import { listProjects, createProject } from './projects.service'

export const projectsTools: AnyWorkspaceTool[] = [
  defineWorkspaceTool({
    name: 'projects.list',
    description: 'List Space Zero projects.',
    safetyLevel: 'read',
    kind: 'app-state',
    domain: 'projects',
    inputSchema: z.object({}).strict(),
    handler: async () => ({ ok: true, data: { projects: await listProjects() } })
  }),
  defineWorkspaceTool({
    name: 'projects.create',
    description: 'Create a Space Zero project.',
    safetyLevel: 'write',
    kind: 'app-state',
    domain: 'projects',
    inputSchema: z.object({ path: z.string(), name: z.string().optional() }).strict(),
    handler: async (input) => {
      const project = await createProject(input)
      return { ok: true, data: { id: project.id, name: project.name, path: project.path } }
    }
  })
]
```

Use `defineWorkspaceTool` so the handler input is inferred and validated
against the zod schema at compile time, without manual casts. Export heterogeneous
tool sets as `AnyWorkspaceTool[]`, the erased type used by the registry.

### UI-control tools

Tools may control renderer UI (for example `ui.toggle-panel`). UI-control tools
still enter through the main-process tool layer: main validates input, applies
the safety policy, records activity, and then sends typed UI commands/events to
the renderer. Agents must never manipulate renderer internals directly.

### Choosing metadata

- **Name**: stable dotted `<domain>.<action>` form, e.g. `projects.create`,
  `settings.get`, `ui.toggle-panel`. Composed aggregate tools such as
  `workspace.getStatus` are allowed when there is a clear product need; do not
  create aggregate tools speculatively.
- **Safety level**: `read` for inspection, `write` for state changes,
  `dangerous` for destructive or hard-to-reverse operations.
- **Kind**: `app-state` for data/application behavior, `ui-control` for tools
  that drive renderer surfaces.
- **Domain**: product domain such as `projects`, `sessions`, `settings`,
  `preview`, `workspace`, or `ui`.
- **Result**: structured data only. Return `{ ok: true, data }` or
  `{ ok: false, error: { code, message } }`. Never include a human-readable
  summary or `message` meant for conversation.

## Composing tools into the registry

The Agent Workspace / Workspace Control Plane composes feature-owned tool sets
into a single registry:

```ts
import { projectsTools } from '../../projects/main/projects.tools'
import { settingsTools } from '../../settings/main/settings.tools'
import {
  composeWorkspaceToolRegistry,
  WorkspaceToolExecutor,
  InMemoryAgentActivityHistory,
  DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY
} from '../../agent-workspace/main'

const registry = composeWorkspaceToolRegistry(projectsTools, settingsTools)
const history = new InMemoryAgentActivityHistory()
const executor = new WorkspaceToolExecutor({
  registry,
  policy: DEFAULT_WORKSPACE_TOOL_SAFETY_POLICY, // or the user's configured policy
  history
})

const result = await executor.execute('projects.create', { path: '~/ws/dev/app' })
```

The executor runs the full pipeline:

1. **resolve** the tool by name (returns `unknown-tool` if absent)
2. **validate** input against the tool's zod schema (returns `invalid-input` if it fails)
3. **evaluate** the global safety policy; if a `write` or `dangerous` tool
   requires confirmation and the policy has not opted in, the handler is not run
   and the result is `confirmation-required`
4. **execute** the handler
5. **return** structured data only
6. **record** a lightweight Agent Activity History entry (metadata only; no
   payloads)

Every outcome — `success`, `error`, `rejected` (unknown tool or invalid input),
and `confirmation-required` — is recorded in Agent Activity History.

## Safety policy

The default policy requires confirmation for all `write` and `dangerous` tools
and never requires it for `read` tools. Builders can opt in to allowing writes
or dangerous tools without confirmation through the global Workspace Tool Safety
Policy. Per-project overrides are out of scope for v0.

## Activity history

Agent Activity History is intentionally lightweight: it records the tool name,
safety level, kind, domain, outcome, timestamp, and (for failures) an error code
and message. It does **not** record input or output payloads by default, so it
is a debugging/visibility aid, not a compliance-grade audit log.

## Out of scope for v0

- Exposing tools through external surfaces (CLI, MCP, local socket, HTTP, public
  API). Tools are reusable internal capabilities, but v0 exposes them only to
  the in-app Agent Workspace.
- Per-project safety policy overrides.
- Building the full Agent Workspace chat UI.
- Direct database, filesystem, raw IPC, or renderer backdoors for agents.
