export type AgentSessionId = string

export type AgentPingRequest = {
  sessionId: AgentSessionId
}

export type AgentPingResponse = {
  sessionId: AgentSessionId
  message: 'pong-from-agent-utility'
  utilityProcessId: number | null
}

export type AgentUtilityCommandName = 'agent.ping'

export type AgentUtilityCommand = {
  type: 'agent.command'
  requestId: string
  command: AgentUtilityCommandName
  sessionId: AgentSessionId
}

export type AgentUtilityEvent = {
  type: 'agent.event'
  event: 'agent.utilityReady'
  sessionId: AgentSessionId
}

export type AgentUtilitySuccessResponse = {
  type: 'agent.response'
  requestId: string
  ok: true
  sessionId: AgentSessionId
  result: AgentPingResponse
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
