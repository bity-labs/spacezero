import type { AgentSessionProjectionEvent } from './agent-session-projection.model'

export type AgentSessionId = string

export type AgentPingRequest = {
  sessionId: AgentSessionId
}

export type AgentPingResponse = {
  sessionId: AgentSessionId
  message: 'pong-from-agent-utility'
  utilityProcessId: number | null
}

export type CreateAgentSessionRequest = {
  sessionId: AgentSessionId
  projectId: string
  cwd: string
  transcriptPath?: string
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

export type ResolveAgentToolConfirmationCommandRequest = {
  sessionId: AgentSessionId
  callId: string
  approved: boolean
}

export type AgentSessionStatus = 'idle' | 'running'

export type AgentSessionState = {
  sessionId: AgentSessionId
  projectId: string
  cwd: string
  status: AgentSessionStatus
  live: boolean
  transcriptPath: string | undefined
  modelProvider: string | undefined
  modelId: string | undefined
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
}

export type AgentUtilityCommandName =
  | 'agent.ping'
  | 'agent.createSession'
  | 'agent.deleteSession'
  | 'agent.getState'
  | 'agent.listSessions'
  | 'agent.resolveToolConfirmation'
  | 'agent.prompt'
  | 'agent.abort'

export type AgentUtilityCommand = {
  type: 'agent.command'
  requestId: string
  command: AgentUtilityCommandName
  sessionId: AgentSessionId
  payload?: unknown
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

export type AgentUtilitySuccessResponse = {
  type: 'agent.response'
  requestId: string
  ok: true
  sessionId: AgentSessionId
  result: AgentPingResponse | AgentSessionState | AgentSessionState[] | undefined
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

export function createAgentSuccessResponse(
  requestId: string,
  sessionId: AgentSessionId,
  result: AgentPingResponse | AgentSessionState | AgentSessionState[] | undefined
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
