import type {
  AgentSessionProjectionEvent,
  AgentTranscriptMessage
} from './agent-session-projection.model'
import type { AuthTestResult, ModelAuthSettings } from './model-auth'
import type { AvailableModel, DefaultModelSetting, SetAgentModelRequest, SetAgentThinkingLevelRequest, ThinkingLevel } from './model-settings'
import type {
  ExecuteWorkspaceToolRequest,
  ExecuteWorkspaceToolResponse,
  WorkspaceToolAgentDescriptor
} from './workspace-tool-protocol'

export type AgentSessionId = string

export type AgentPingRequest = {
  sessionId: AgentSessionId
}

export type AgentPingResponse = {
  sessionId: AgentSessionId
  message: 'pong-from-agent-utility'
  utilityProcessId: number | null
}

export type AgentSessionKind = 'project' | 'workspace'

export type CreateAgentSessionRequest = {
  sessionId: AgentSessionId
  kind?: AgentSessionKind
  projectId: string | null
  cwd: string
  transcriptPath?: string
  workspaceTools?: WorkspaceToolAgentDescriptor[]
  defaultModel?: DefaultModelSetting
  thinkingLevel?: ThinkingLevel
}

export type GetAgentSessionStateRequest = {
  sessionId: AgentSessionId
}

export type PromptAgentSessionRequest = {
  sessionId: AgentSessionId
  message: string
}

export type AbortAgentSessionRequest = {
  sessionId: AgentSessionId
}

export type DeleteAgentSessionRequest = {
  sessionId: AgentSessionId
}

export type AgentAddApiKeyRequest = {
  providerId: string
  apiKey: string
}

export type AgentProviderRequest = {
  providerId: string
}

export type AgentOAuthCallbackRequest = {
  url: string
}

export type ResolveAgentToolConfirmationCommandRequest = {
  sessionId: AgentSessionId
  callId: string
  approved: boolean
}

export type AgentSessionStatus = 'idle' | 'running'

export type AgentSessionState = {
  sessionId: AgentSessionId
  kind?: AgentSessionKind
  projectId: string | null
  cwd: string
  status: AgentSessionStatus
  live: boolean
  transcriptPath: string | undefined
  modelProvider: string | undefined
  modelId: string | undefined
  thinkingLevel?: ThinkingLevel
  transcriptSnapshot?: AgentTranscriptMessage[]
}

export type AgentStreamingEventType =
  | 'agent_start'
  | 'turn_start'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'turn_end'
  | 'agent_end'

export type AgentStreamingEvent = {
  type: AgentStreamingEventType
  sessionId: AgentSessionId
  messageId?: string
  delta?: string
  message?: AgentTranscriptMessage
}

export type AgentUtilityCommandName =
  | 'agent.ping'
  | 'agent.createSession'
  | 'agent.deleteSession'
  | 'agent.getState'
  | 'agent.listSessions'
  | 'agent.addApiKey'
  | 'agent.removeApiKey'
  | 'agent.getAuthStatus'
  | 'agent.getAvailableModels'
  | 'agent.setModel'
  | 'agent.setThinkingLevel'
  | 'agent.testAuth'
  | 'agent.loginOAuth'
  | 'agent.logoutOAuth'
  | 'agent.handleOAuthCallback'
  | 'agent.openOAuthUrl'
  | 'agent.resolveToolConfirmation'
  | 'agent.prompt'
  | 'agent.abort'
  | 'workspaceTool.execute'

export type AgentUtilityCommand = {
  type: 'agent.command'
  requestId: string
  command: AgentUtilityCommandName
  sessionId: AgentSessionId
  payload?: unknown
}

export type ExecuteWorkspaceToolCommand = AgentUtilityCommand & {
  command: 'workspaceTool.execute'
  payload: ExecuteWorkspaceToolRequest
}

export type AgentUtilityEvent =
  | {
      type: 'agent.event'
      event: 'agent.utilityReady'
      sessionId: AgentSessionId
      payload?: undefined
    }
  | {
      type: 'agent.event'
      event: 'agent.sessionStatusChanged'
      sessionId: AgentSessionId
      payload: AgentSessionState
    }
  | {
      type: 'agent.event'
      event: 'agent.sessionRehydrated'
      sessionId: AgentSessionId
      payload: AgentSessionState
    }
  | {
      type: 'agent.event'
      event: 'agent.sessionSuspended'
      sessionId: AgentSessionId
      payload: AgentSessionState
    }
  | {
      type: 'agent.event'
      event: 'agent.streaming'
      sessionId: AgentSessionId
      payload: AgentStreamingEvent
    }

export type AgentUtilityEventName = AgentUtilityEvent['event']

export type AgentUtilityResult =
  | AgentPingResponse
  | AgentSessionState
  | AgentSessionState[]
  | ExecuteWorkspaceToolResponse
  | ModelAuthSettings
  | AvailableModel[]
  | AuthTestResult
  | { handled: boolean }
  | undefined

export type AgentUtilitySuccessResponse = {
  type: 'agent.response'
  requestId: string
  ok: true
  sessionId: AgentSessionId
  result: AgentUtilityResult
}

export type AgentUtilityFailureResponse = {
  type: 'agent.response'
  requestId: string
  ok: false
  sessionId?: AgentSessionId
  error: {
    code: string
    message: string
  }
}

export type AgentUtilityResponse = AgentUtilitySuccessResponse | AgentUtilityFailureResponse

export type AgentUtilityProjectionEvent = {
  type: 'agent.sessionProjectionEvent'
  event: AgentSessionProjectionEvent
}

export type AgentUtilityFrame =
  | AgentUtilityCommand
  | AgentUtilityEvent
  | AgentUtilityProjectionEvent
  | AgentUtilityResponse

export type AgentUtilityConnectMessage = {
  type: 'spacezero.agent.connect'
}

export function createAgentPingCommand(
  requestId: string,
  request: AgentPingRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.ping',
    sessionId: request.sessionId
  }
}

export function createAgentCreateSessionCommand(
  requestId: string,
  request: CreateAgentSessionRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.createSession',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentGetStateCommand(
  requestId: string,
  request: GetAgentSessionStateRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.getState',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentDeleteSessionCommand(
  requestId: string,
  request: DeleteAgentSessionRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.deleteSession',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentListSessionsCommand(requestId: string): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.listSessions',
    sessionId: 'agent-session-list'
  }
}

export function createAgentAddApiKeyCommand(
  requestId: string,
  request: AgentAddApiKeyRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.addApiKey',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentRemoveApiKeyCommand(
  requestId: string,
  request: AgentProviderRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.removeApiKey',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentGetAuthStatusCommand(requestId: string): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.getAuthStatus',
    sessionId: 'agent-auth'
  }
}

export function createAgentGetAvailableModelsCommand(requestId: string): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.getAvailableModels',
    sessionId: 'agent-auth'
  }
}

export function createAgentSetModelCommand(
  requestId: string,
  request: SetAgentModelRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.setModel',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentSetThinkingLevelCommand(
  requestId: string,
  request: SetAgentThinkingLevelRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.setThinkingLevel',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentTestAuthCommand(
  requestId: string,
  request: AgentProviderRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.testAuth',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentLoginOAuthCommand(
  requestId: string,
  request: AgentProviderRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.loginOAuth',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentLogoutOAuthCommand(
  requestId: string,
  request: AgentProviderRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.logoutOAuth',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentHandleOAuthCallbackCommand(
  requestId: string,
  request: AgentOAuthCallbackRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.handleOAuthCallback',
    sessionId: 'agent-auth',
    payload: request
  }
}

export function createAgentResolveToolConfirmationCommand(
  requestId: string,
  request: ResolveAgentToolConfirmationCommandRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.resolveToolConfirmation',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentPromptCommand(
  requestId: string,
  request: PromptAgentSessionRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.prompt',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentAbortCommand(
  requestId: string,
  request: AbortAgentSessionRequest
): AgentUtilityCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'agent.abort',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createExecuteWorkspaceToolCommand(
  requestId: string,
  request: ExecuteWorkspaceToolRequest
): ExecuteWorkspaceToolCommand {
  return {
    type: 'agent.command',
    requestId,
    command: 'workspaceTool.execute',
    sessionId: request.sessionId,
    payload: request
  }
}

export function createAgentSuccessResponse(
  requestId: string,
  sessionId: AgentSessionId,
  result: AgentUtilityResult
): AgentUtilitySuccessResponse {
  return {
    type: 'agent.response',
    requestId,
    ok: true,
    sessionId,
    result
  }
}

export function createAgentPingResponse(
  requestId: string,
  sessionId: AgentSessionId,
  utilityProcessId: number | null
): AgentUtilitySuccessResponse {
  return {
    type: 'agent.response',
    requestId,
    ok: true,
    sessionId,
    result: {
      sessionId,
      message: 'pong-from-agent-utility',
      utilityProcessId
    }
  }
}
