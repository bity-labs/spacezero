import type { MessagePortMain } from 'electron/main'
import type { MessageEvent, ParentPort } from 'electron/utility'

import { join } from 'node:path'

import { AgentSessionRegistry } from './agent-session-registry'
import { createPiAgentSessionFactory } from './pi-agent-session-factory'
import type {
  AgentUtilityCommand,
  AgentUtilityConnectMessage,
  AgentUtilityFrame,
  AgentUtilityResponse,
  CreateAgentSessionRequest,
  GetAgentSessionStateRequest
} from '../shared/agent-protocol'
import { createAgentPingResponse, createAgentSuccessResponse } from '../shared/agent-protocol'

function isConnectMessage(value: unknown): value is AgentUtilityConnectMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'spacezero.agent.connect'
  )
}

const agentDir = process.env.SPACEZERO_AGENT_DIR ?? join(process.cwd(), '.spacezero-agent')
const sessionRegistry = new AgentSessionRegistry({
  createPiSession: createPiAgentSessionFactory({ agentDir })
})

function createFailureResponse(command: AgentUtilityCommand, message: string): AgentUtilityResponse {
  return {
    type: 'agent.response',
    requestId: command.requestId,
    ok: false,
    sessionId: command.sessionId,
    error: {
      code: 'agent.unknownCommand',
      message
    }
  }
}

async function handleCommand(command: AgentUtilityCommand): Promise<AgentUtilityResponse> {
  try {
    if (command.command === 'agent.ping') {
      return createAgentPingResponse(command.requestId, command.sessionId, process.pid || null)
    }

    if (command.command === 'agent.createSession') {
      const result = await sessionRegistry.createSession(command.payload as CreateAgentSessionRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.getState') {
      const result = await sessionRegistry.getState(command.payload as GetAgentSessionStateRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.listSessions') {
      const result = await sessionRegistry.listSessions()
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    return createFailureResponse(command, `Unknown agent utility command: ${command.command}`)
  } catch (error) {
    return createFailureResponse(command, error instanceof Error ? error.message : String(error))
  }
}

function attachAgentPort(port: MessagePortMain): void {
  port.on('message', (event: MessageEvent) => {
    const frame = event.data as AgentUtilityFrame

    if (frame.type !== 'agent.command') return

    void handleCommand(frame).then((response) => port.postMessage(response))
  })
  port.start()
}

const utilityParentPort = (
  process as NodeJS.Process & { parentPort?: ParentPort }
).parentPort

utilityParentPort?.once('message', (event: MessageEvent) => {
  if (!isConnectMessage(event.data)) return

  const [port] = event.ports ?? []
  if (!port) return

  attachAgentPort(port)
})
