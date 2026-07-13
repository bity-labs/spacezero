import type { MessagePortMain } from 'electron/main'
import type { MessageEvent, ParentPort } from 'electron/utility'

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { AgentSessionRegistry } from './agent-session-registry'
import { createPiAgentSessionFactory } from './pi-agent-session-factory'
import type {
  AgentUtilityCommand,
  AgentUtilityConnectMessage,
  AgentUtilityFrame,
  AgentUtilityResponse,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest
} from '../shared/agent-protocol'
import {
  createAgentPingResponse,
  createAgentSuccessResponse,
  createExecuteWorkspaceToolCommand
} from '../shared/agent-protocol'
import type { WorkspaceToolResult } from '../features/agent-workspace/shared/workspace-tool.model'
import type { ExecuteWorkspaceToolRequest } from '../shared/workspace-tool-protocol'

function isConnectMessage(value: unknown): value is AgentUtilityConnectMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'spacezero.agent.connect'
  )
}

const agentDir = process.env.SPACEZERO_AGENT_DIR ?? join(process.cwd(), '.spacezero-agent')
const pendingWorkspaceToolRequests = new Map<
  string,
  { resolve: (result: WorkspaceToolResult) => void; reject: (error: Error) => void }
>()
let agentPort: MessagePortMain | undefined

function executeWorkspaceToolInMain(request: ExecuteWorkspaceToolRequest): Promise<WorkspaceToolResult> {
  if (!agentPort) {
    return Promise.resolve({
      ok: false,
      error: { code: 'workspace-tool-port-unavailable', message: 'Workspace Tool port unavailable' }
    })
  }

  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    pendingWorkspaceToolRequests.set(requestId, { resolve, reject })
    agentPort!.postMessage(createExecuteWorkspaceToolCommand(requestId, request))
  })
}

function createFailureResponse(
  command: AgentUtilityCommand,
  message: string,
  code = getAgentErrorCode(message)
): AgentUtilityResponse {
  return {
    type: 'agent.response',
    requestId: command.requestId,
    ok: false,
    sessionId: command.sessionId,
    error: {
      code,
      message
    }
  }
}

function getAgentErrorCode(message: string): string {
  return /^agent\.[A-Za-z0-9._-]+$/.test(message) ? message : 'agent.commandFailed'
}

async function handleCommand(
  command: AgentUtilityCommand,
  sessionRegistry: AgentSessionRegistry
): Promise<AgentUtilityResponse> {
  try {
    if (command.command === 'agent.ping') {
      return createAgentPingResponse(command.requestId, command.sessionId, process.pid || null)
    }

    if (command.command === 'agent.createSession') {
      const result = await sessionRegistry.createSession(command.payload as CreateAgentSessionRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.deleteSession') {
      await sessionRegistry.deleteSession(command.payload as DeleteAgentSessionRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.getState') {
      const result = await sessionRegistry.getState(command.payload as GetAgentSessionStateRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.listSessions') {
      const result = await sessionRegistry.listSessions()
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    return createFailureResponse(command, `Unknown agent utility command: ${command.command}`, 'agent.unknownCommand')
  } catch (error) {
    return createFailureResponse(command, error instanceof Error ? error.message : String(error))
  }
}

function getMaxLiveSessions(): number | undefined {
  const rawValue = process.env.SPACEZERO_AGENT_MAX_LIVE_SESSIONS
  if (!rawValue) return undefined

  const trimmedValue = rawValue.trim()
  if (!/^\d+$/.test(trimmedValue)) return undefined

  return Number.parseInt(trimmedValue, 10)
}

function handleResponse(response: AgentUtilityResponse): void {
  const pending = pendingWorkspaceToolRequests.get(response.requestId)
  if (!pending) return

  pendingWorkspaceToolRequests.delete(response.requestId)
  if (response.ok) {
    pending.resolve(response.result as WorkspaceToolResult)
    return
  }

  pending.reject(new Error(response.error.message))
}

function attachAgentPort(port: MessagePortMain): void {
  agentPort = port
  const sessionRegistry = new AgentSessionRegistry({
    createPiSession: createPiAgentSessionFactory({
      agentDir,
      executeWorkspaceTool: (request) => executeWorkspaceToolInMain(request)
    }),
    maxLiveSessions: getMaxLiveSessions(),
    onEvent: (event) => {
      port.postMessage({
        type: 'agent.event',
        event: event.event,
        sessionId: event.sessionId,
        payload: event.state
      })
    }
  })

  port.on('message', (event: MessageEvent) => {
    const frame = event.data as AgentUtilityFrame

    if (frame.type === 'agent.response') {
      handleResponse(frame)
      return
    }

    if (frame.type !== 'agent.command') return

    void handleCommand(frame, sessionRegistry).then((response) => port.postMessage(response))
  })
  port.on('close', () => {
    agentPort = undefined
    for (const pending of pendingWorkspaceToolRequests.values()) {
      pending.reject(new Error('workspace-tool-port-closed'))
    }
    pendingWorkspaceToolRequests.clear()
    sessionRegistry.dispose()
  })
  port.start()
}

const utilityParentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort

utilityParentPort?.once('message', (event: MessageEvent) => {
  if (!isConnectMessage(event.data)) return

  const [port] = event.ports ?? []
  if (!port) return

  attachAgentPort(port)
})
