import type {
  WorkspaceToolDomain,
  WorkspaceToolKind,
  WorkspaceToolResult,
  WorkspaceToolSafetyLevel
} from '../features/agent-workspace/shared/workspace-tool.model'

export type WorkspaceToolAgentDescriptor = {
  name: string
  description: string
  safetyLevel: WorkspaceToolSafetyLevel
  kind: WorkspaceToolKind
  domain: WorkspaceToolDomain
  parameters: Record<string, unknown>
}

export type ExecuteWorkspaceToolRequest = {
  sessionId: string
  parentSessionId?: string
  toolName: string
  input: unknown
  safetyLevel: WorkspaceToolSafetyLevel
  callId: string
}

export type ExecuteWorkspaceToolResponse = WorkspaceToolResult

export type AgentToolExecutionEvent = {
  sessionId: string
  callId: string
  toolName: string
  state: 'running' | 'success' | 'error'
  input?: unknown
  output?: unknown
  error?: string
}
