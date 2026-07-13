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

export type DeleteAgentSessionRequest = {
  sessionId: AgentSessionId
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

export type AgentUtilityCommandName =
  | 'agent.ping'
  | 'agent.createSession'
  | 'agent.deleteSession'
  | 'agent.getState'
  | 'agent.listSessions'

export type AgentUtilityCommand = {
  type: 'agent.command'
  requestId: string
  command: AgentUtilityCommandName
  sessionId: AgentSessionId
  payload?: unknown
}

export type AgentUtilityEventName =
  | 'agent.utilityReady'
  | 'agent.sessionStatusChanged'
  | 'agent.sessionRehydrated'
  | 'agent.sessionSuspended'

export type AgentUtilityEvent = {
  type: 'agent.event'
  event: AgentUtilityEventName
  sessionId: AgentSessionId
  payload?: unknown
}

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

export type AgentUtilityFrame = AgentUtilityCommand | AgentUtilityEvent | AgentUtilityResponse

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
