import type { MessagePortMain } from 'electron/main'
import type { MessageEvent, ParentPort } from 'electron/utility'

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { AgentSessionRegistry } from './agent-session-registry'
import { createPiAgentRuntime, type PiAgentRuntime } from './pi-agent-session-factory'
import type {
  AbortAgentSessionRequest,
  AgentStreamingEvent,
  AgentUtilityCommand,
  AgentUtilityConnectMessage,
  AgentUtilityFrame,
  AgentUtilityResponse,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  ListAgentSkillsRequest,
  PromptAgentSessionRequest,
  ResolveAgentToolConfirmationCommandRequest
} from '../shared/agent-protocol'
import {
  createAgentPingResponse,
  createAgentSuccessResponse,
  createExecuteWorkspaceToolCommand
} from '../shared/agent-protocol'
import type { WorkspaceToolResult } from '../features/agent-workspace/shared/workspace-tool.model'
import type {
  AgentAssistantMessage,
  AgentSessionProjectionEvent,
  AgentTranscriptMessage
} from '../shared/agent-session-projection.model'
import type { SetAgentModelRequest, SetAgentThinkingLevelRequest } from '../shared/model-settings'
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
const WORKSPACE_TOOL_REQUEST_TIMEOUT_MS = 30_000
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60_000
const pendingUtilityRequests = new Map<
  string,
  { resolve: (result: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }
>()
const pendingOAuthCallbacks = new Map<
  string,
  { resolve: (url: string) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }
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
    const timeout = setTimeout(() => {
      if (!pendingUtilityRequests.delete(requestId)) return
      reject(new Error('workspace-tool-request-timeout'))
    }, WORKSPACE_TOOL_REQUEST_TIMEOUT_MS)

    pendingUtilityRequests.set(requestId, { resolve: (result) => resolve(result as WorkspaceToolResult), reject, timeout })
    agentPort!.postMessage(createExecuteWorkspaceToolCommand(requestId, request))
  })
}

function requestOpenOAuthUrl(url: string): Promise<void> {
  if (!agentPort) return Promise.reject(new Error('agent.oauthPortUnavailable'))

  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    pendingUtilityRequests.set(requestId, {
      resolve: () => resolve(),
      reject,
      timeout: setTimeout(() => {
        if (!pendingUtilityRequests.delete(requestId)) return
        reject(new Error('agent.oauthOpenExternalTimedOut'))
      }, WORKSPACE_TOOL_REQUEST_TIMEOUT_MS)
    })
    agentPort!.postMessage({
      type: 'agent.command',
      requestId,
      command: 'agent.openOAuthUrl',
      sessionId: 'agent-auth',
      payload: { url }
    })
  })
}

function waitForOAuthCallback(providerId: string): Promise<string> {
  const existing = pendingOAuthCallbacks.get(providerId)
  if (existing) {
    clearTimeout(existing.timeout)
    existing.reject(new Error('agent.oauthCallbackReplaced'))
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!pendingOAuthCallbacks.delete(providerId)) return
      reject(new Error('agent.oauthCallbackTimedOut'))
    }, OAUTH_CALLBACK_TIMEOUT_MS)

    pendingOAuthCallbacks.set(providerId, { resolve, reject, timeout })
  })
}

function handleOAuthCallbackUrl(url: string): boolean {
  let providerId: string | undefined
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'spacezero:' || parsedUrl.hostname !== 'oauth') return false
    providerId = parsedUrl.pathname.split('/').filter(Boolean)[0] ?? parsedUrl.searchParams.get('provider') ?? undefined
  } catch {
    return false
  }

  if (!providerId) return false
  const pending = pendingOAuthCallbacks.get(providerId)
  if (!pending) return false
  pendingOAuthCallbacks.delete(providerId)
  clearTimeout(pending.timeout)
  pending.resolve(url)
  return true
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

type AgentSessionProjectionEventWithoutSeq = AgentSessionProjectionEvent extends infer Event
  ? Event extends { seq: number }
    ? Omit<Event, 'seq'>
    : never
  : never

type EmitProjectionEvent = (event: AgentSessionProjectionEventWithoutSeq) => void

async function handleCommand(
  command: AgentUtilityCommand,
  sessionRegistry: AgentSessionRegistry,
  piRuntime: PiAgentRuntime,
  emitProjectionEvent: EmitProjectionEvent
): Promise<AgentUtilityResponse> {
  try {
    if (command.command === 'agent.ping') {
      return createAgentPingResponse(command.requestId, command.sessionId, process.pid || null)
    }

    if (command.command === 'agent.createSession') {
      const result = await sessionRegistry.createSession(command.payload as CreateAgentSessionRequest)
      emitProjectionEvent({
        type: 'snapshot',
        sessionId: result.sessionId,
        snapshot: { status: result.status, messages: [] }
      })
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.listSkills') {
      const request = command.payload as ListAgentSkillsRequest
      const result = await piRuntime.listSkills(request.skillPaths)
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

    if (command.command === 'agent.addApiKey') {
      const request = command.payload as { providerId: string; apiKey: string }
      await piRuntime.addApiKey(request.providerId, request.apiKey)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.removeApiKey') {
      const request = command.payload as { providerId: string }
      await piRuntime.removeApiKey(request.providerId)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.getAuthStatus') {
      const result = await piRuntime.getAuthStatus()
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.getAvailableModels') {
      const result = await piRuntime.getAvailableModels()
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.setModel') {
      const result = await sessionRegistry.setModel(command.payload as SetAgentModelRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.setThinkingLevel') {
      const result = await sessionRegistry.setThinkingLevel(command.payload as SetAgentThinkingLevelRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.testAuth') {
      const request = command.payload as { providerId: string }
      const result = await piRuntime.testAuth(request.providerId)
      return createAgentSuccessResponse(command.requestId, command.sessionId, result)
    }

    if (command.command === 'agent.loginOAuth') {
      const request = command.payload as { providerId: string }
      await piRuntime.loginOAuth(request.providerId, {
        openExternal: requestOpenOAuthUrl,
        waitForCallback: waitForOAuthCallback
      })
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.logoutOAuth') {
      const request = command.payload as { providerId: string }
      await piRuntime.logoutOAuth(request.providerId)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.handleOAuthCallback') {
      const request = command.payload as { url: string }
      return createAgentSuccessResponse(command.requestId, command.sessionId, { handled: handleOAuthCallbackUrl(request.url) })
    }

    if (command.command === 'agent.resolveToolConfirmation') {
      const request = command.payload as ResolveAgentToolConfirmationCommandRequest
      await sessionRegistry.resolveToolConfirmation(request)
      emitProjectionEvent({
        type: 'tool_confirmation_resolved',
        sessionId: request.sessionId,
        callId: request.callId,
        approved: request.approved
      })
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.prompt') {
      const request = command.payload as PromptAgentSessionRequest
      emitProjectionEvent({
        type: 'message_start',
        sessionId: request.sessionId,
        message: {
          role: 'user',
          content: request.displayMessage ?? request.message,
          timestamp: Date.now()
        }
      })
      await sessionRegistry.prompt(request)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    if (command.command === 'agent.abort') {
      await sessionRegistry.abort(command.payload as AbortAgentSessionRequest)
      return createAgentSuccessResponse(command.requestId, command.sessionId, undefined)
    }

    return createFailureResponse(command, `Unknown agent utility command: ${command.command}`, 'agent.unknownCommand')
  } catch (error) {
    return createFailureResponse(command, error instanceof Error ? error.message : String(error))
  }
}

function toAssistantProjectionMessage(
  message: AgentTranscriptMessage | undefined
): AgentAssistantMessage | undefined {
  return message?.role === 'assistant' && 'content' in message && Array.isArray(message.content)
    ? (message as AgentAssistantMessage)
    : undefined
}

function createEmptyAssistantMessage(): AgentAssistantMessage {
  return {
    role: 'assistant',
    content: [],
    timestamp: Date.now()
  }
}

function appendTextDelta(message: AgentAssistantMessage, delta: string): AgentAssistantMessage {
  const existingTextIndex = message.content.findIndex((part) => part.type === 'text')
  if (existingTextIndex === -1) {
    return {
      ...message,
      content: [...message.content, { type: 'text', text: delta }]
    }
  }

  return {
    ...message,
    content: message.content.map((part, index) =>
      index === existingTextIndex && part.type === 'text'
        ? { ...part, text: `${part.text}${delta}` }
        : part
    )
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
  const pending = pendingUtilityRequests.get(response.requestId)
  if (!pending) return

  pendingUtilityRequests.delete(response.requestId)
  clearTimeout(pending.timeout)
  if (response.ok) {
    pending.resolve(response.result as WorkspaceToolResult)
    return
  }

  pending.reject(new Error(response.error.message))
}

function attachAgentPort(port: MessagePortMain): void {
  agentPort = port
  const projectionSeqBySessionId = new Map<string, number>()
  const assistantMessagesBySessionId = new Map<string, AgentAssistantMessage>()
  const emitProjectionEvent: EmitProjectionEvent = (event) => {
    const seq = (projectionSeqBySessionId.get(event.sessionId) ?? 0) + 1
    projectionSeqBySessionId.set(event.sessionId, seq)
    port.postMessage({
      type: 'agent.sessionProjectionEvent',
      event: { ...event, seq }
    })
  }

  const emitStreamingProjectionEvent = (event: AgentStreamingEvent): void => {
    if (event.type === 'agent_start' || event.type === 'turn_start') {
      emitProjectionEvent({ type: 'agent_start', sessionId: event.sessionId })
      return
    }

    if (event.type === 'agent_end' || event.type === 'turn_end') {
      emitProjectionEvent({ type: 'agent_end', sessionId: event.sessionId })
      return
    }

    if (event.type === 'message_start') {
      const message = toAssistantProjectionMessage(event.message) ?? createEmptyAssistantMessage()
      assistantMessagesBySessionId.set(event.sessionId, message)
      emitProjectionEvent({ type: 'message_start', sessionId: event.sessionId, message })
      return
    }

    if (event.type === 'message_update') {
      const message =
        toAssistantProjectionMessage(event.message) ??
        appendTextDelta(
          assistantMessagesBySessionId.get(event.sessionId) ?? createEmptyAssistantMessage(),
          event.delta ?? ''
        )
      assistantMessagesBySessionId.set(event.sessionId, message)
      emitProjectionEvent({ type: 'message_update', sessionId: event.sessionId, message })
      return
    }

    if (event.type === 'message_end') {
      const message =
        toAssistantProjectionMessage(event.message) ??
        assistantMessagesBySessionId.get(event.sessionId) ??
        createEmptyAssistantMessage()
      assistantMessagesBySessionId.delete(event.sessionId)
      emitProjectionEvent({ type: 'message_end', sessionId: event.sessionId, message })
    }
  }

  const piRuntime = createPiAgentRuntime({
    agentDir,
    executeWorkspaceTool: (request) => executeWorkspaceToolInMain(request)
  })

  const sessionRegistry = new AgentSessionRegistry({
    createPiSession: piRuntime.createSession,
    maxLiveSessions: getMaxLiveSessions(),
    onEvent: (event) => {
      port.postMessage({
        type: 'agent.event',
        event: event.event,
        sessionId: event.sessionId,
        payload: event.state
      })
    },
    onStreamingEvent: (event) => {
      port.postMessage({
        type: 'agent.event',
        event: 'agent.streaming',
        sessionId: event.sessionId,
        payload: event
      })
      emitStreamingProjectionEvent(event)
    }
  })

  port.on('message', (event: MessageEvent) => {
    const frame = event.data as AgentUtilityFrame

    if (frame.type === 'agent.response') {
      handleResponse(frame)
      return
    }

    if (frame.type !== 'agent.command') return

    void handleCommand(frame, sessionRegistry, piRuntime, emitProjectionEvent).then((response) =>
      port.postMessage(response)
    )
  })
  port.on('close', () => {
    agentPort = undefined
    for (const pending of pendingUtilityRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('workspace-tool-port-closed'))
    }
    pendingUtilityRequests.clear()
    for (const pending of pendingOAuthCallbacks.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('agent.oauthPortClosed'))
    }
    pendingOAuthCallbacks.clear()
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
