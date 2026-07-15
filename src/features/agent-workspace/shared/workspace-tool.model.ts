/**
 * Serializable Workspace Tool contracts shared across process boundaries.
 *
 * These types describe capabilities that agents may call through the Workspace
 * Control Plane. They intentionally contain no functions so they can cross the
 * Electron IPC boundary. The executable tool definitions (with handlers) live
 * in the main-process feature module.
 */

/** How destructive a Workspace Tool call can be. Drives confirmation policy. */
export type WorkspaceToolSafetyLevel = 'read' | 'write' | 'dangerous'

/** Whether a tool operates app state or controls renderer UI. */
export type WorkspaceToolKind = 'app-state' | 'ui-control'

/** Product domain a tool belongs to, such as `projects`, `sessions`, or `ui`. */
export type WorkspaceToolDomain = string

/** Outcome of a Workspace Tool execution, recorded in Agent Activity History. */
export type AgentActivityOutcome = 'success' | 'error' | 'rejected' | 'confirmation-required' | 'denied'

/**
 * Tool metadata that is safe to share across processes and with the agent
 * harness. The executable {@link WorkspaceTool} extends this with an input
 * schema and handler in the main-process module.
 */
export type WorkspaceToolMetadata = {
  /** Stable dotted name, such as `projects.list` or `ui.toggle-panel`. */
  name: string
  /** Short human-readable description shown to the agent and builders. */
  description: string
  safetyLevel: WorkspaceToolSafetyLevel
  kind: WorkspaceToolKind
  domain: WorkspaceToolDomain
}

/**
 * Structured success result returned by every Workspace Tool call.
 *
 * Tools return structured data only. Agents interpret and summarize results in
 * conversation; Space Zero never returns polished conversational summaries from
 * a tool.
 */
export type WorkspaceToolSuccess = {
  ok: true
  data?: unknown
}

/**
 * Structured failure result returned by every Workspace Tool call.
 *
 * Failures always carry a stable machine-readable `code` and a `message`.
 */
export type WorkspaceToolFailure = {
  ok: false
  error: {
    code: string
    message: string
  }
}

/**
 * Structured result returned by every Workspace Tool call.
 *
 * This is a discriminated union on `ok` so invalid results such as
 * `{ ok: false }` without an error, `{ ok: true, error: ... }`, or
 * `{ ok: false, data: ... }` are rejected at compile time.
 */
export type WorkspaceToolResult = WorkspaceToolSuccess | WorkspaceToolFailure

/**
 * Global user-configurable policy that decides whether agent tool calls require
 * confirmation. Defaults are conservative. Per-project overrides are out of
 * scope for v0.
 */
export type WorkspaceToolSafetyPolicy = {
  allowWriteWithoutConfirmation: boolean
  allowDangerousWithoutConfirmation: boolean
}

/**
 * Lightweight Agent Activity History record.
 *
 * Captures enough metadata to explain what happened for visibility and
 * debugging. It deliberately does not store full tool input or output payloads
 * by default, so it is not a compliance-grade audit log.
 */
export type AgentActivityRecord = {
  id: string
  toolName: string
  outcome: AgentActivityOutcome
  recordedAt: string
  safetyLevel?: WorkspaceToolSafetyLevel
  kind?: WorkspaceToolKind
  domain?: WorkspaceToolDomain
  error?: {
    code: string
    message: string
  }
}
