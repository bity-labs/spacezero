import type { MessagePortMain } from 'electron/main'
import type { MessageEvent, ParentPort } from 'electron/utility'

import type {
  AgentUtilityCommand,
  AgentUtilityConnectMessage,
  AgentUtilityFrame,
  AgentUtilityResponse
} from '../shared/agent-protocol'
import { createAgentPingResponse } from '../shared/agent-protocol'

function isConnectMessage(value: unknown): value is AgentUtilityConnectMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'spacezero.agent.connect'
  )
}

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

function handleCommand(command: AgentUtilityCommand): AgentUtilityResponse {
  if (command.command === 'agent.ping') {
    return createAgentPingResponse(command.requestId, command.sessionId, process.pid || null)
  }

  return createFailureResponse(command, `Unknown agent utility command: ${command.command}`)
}

function attachAgentPort(port: MessagePortMain): void {
  port.on('message', (event: MessageEvent) => {
    const frame = event.data as AgentUtilityFrame

    if (frame.type !== 'agent.command') return

    port.postMessage(handleCommand(frame))
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
