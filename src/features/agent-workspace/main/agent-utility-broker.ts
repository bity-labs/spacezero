import { randomUUID } from 'node:crypto'

import type {
  AbortAgentSessionRequest,
  AgentAddApiKeyRequest,
  AgentPingRequest,
  AgentPingResponse,
  AgentOAuthCallbackRequest,
  AgentProviderRequest,
  AgentSessionState,
  AgentStreamingEvent,
  AgentUtilityFrame,
  AgentUtilityResponse,
  AgentUtilityResult,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  ListAgentSkillsRequest,
  PromptAgentSessionRequest,
  ResolveAgentToolConfirmationCommandRequest
} from '../../../shared/agent-protocol'
import {
  createAgentAbortCommand,
  createAgentAddApiKeyCommand,
  createAgentCreateSessionCommand,
  createAgentDeleteSessionCommand,
  createAgentGetAuthStatusCommand,
  createAgentGetAvailableModelsCommand,
  createAgentGetStateCommand,
  createAgentHandleOAuthCallbackCommand,
  createAgentLoginOAuthCommand,
  createAgentListSessionsCommand,
  createAgentListSkillsCommand,
  createAgentPingCommand,
  createAgentRemoveApiKeyCommand,
  createAgentLogoutOAuthCommand,
  createAgentSetModelCommand,
  createAgentSetThinkingLevelCommand,
  createAgentTestAuthCommand,
  createAgentPromptCommand,
  createAgentResolveToolConfirmationCommand
} from '../../../shared/agent-protocol'
import type { AuthTestResult, ModelAuthSettings } from '../../../shared/model-auth'
import type { AvailableModel, SetAgentModelRequest, SetAgentThinkingLevelRequest } from '../../../shared/model-settings'
import type { ExecuteWorkspaceToolRequest } from '../../../shared/workspace-tool-protocol'
import type { AgentSkillDiscovery } from '../shared/agent-skill.model'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS = 60_000
const DEFAULT_OAUTH_LOGIN_TIMEOUT_MS = 5 * 60_000

export type AgentUtilityPort = {
  postMessage: (frame: AgentUtilityFrame) => void
  onMessage: (handler: (frame: AgentUtilityFrame) => void) => void
  onClose: (handler: () => void) => void
}

type PendingRequest = {
  resolve: (response: AgentUtilityResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout | undefined
}

type AgentUtilityBrokerOptions = {
  createRequestId?: () => string
  requestTimeoutMs?: number
  sessionLifecycleTimeoutMs?: number
  oauthLoginTimeoutMs?: number
  onEvent?: (event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void
  onProjectionEvent?: (event: Extract<AgentUtilityFrame, { type: 'agent.sessionProjectionEvent' }>) => void
  executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<AgentUtilityResult>
  openExternal?: (url: string) => Promise<void>
}

type SendOptions = {
  timeoutMs?: number | false
  onTimeout?: () => void
}

export class AgentUtilityBroker {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly createRequestId: () => string
  private readonly requestTimeoutMs: number
  private readonly sessionLifecycleTimeoutMs: number
  private readonly oauthLoginTimeoutMs: number
  private readonly forwardEvent: ((event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void) | undefined
  private readonly onProjectionEvent:
    | ((event: Extract<AgentUtilityFrame, { type: 'agent.sessionProjectionEvent' }>) => void)
    | undefined
  private readonly executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<AgentUtilityResult>
  private readonly openExternal?: (url: string) => Promise<void>
  private readonly streamingEventListeners = new Set<(event: AgentStreamingEvent) => void>()
  private disposed = false

  constructor(
    private readonly port: AgentUtilityPort,
    options: AgentUtilityBrokerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.sessionLifecycleTimeoutMs = options.sessionLifecycleTimeoutMs ?? DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS
    this.oauthLoginTimeoutMs = options.oauthLoginTimeoutMs ?? DEFAULT_OAUTH_LOGIN_TIMEOUT_MS
    this.forwardEvent = options.onEvent
    this.onProjectionEvent = options.onProjectionEvent
    this.executeWorkspaceTool = options.executeWorkspaceTool
    this.openExternal = options.openExternal
    this.port.onMessage((frame) => this.handleFrame(frame))
    this.port.onClose(() => this.dispose(new Error('agent.utilityPortClosed')))
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    return this.send(createAgentPingCommand(this.createRequestId(), request)) as Promise<AgentPingResponse>
  }

  createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    return this.send(createAgentCreateSessionCommand(this.createRequestId(), request), {
      timeoutMs: this.sessionLifecycleTimeoutMs,
      onTimeout: () => {
        void this.deleteSession({ sessionId: request.sessionId }).catch(() => undefined)
      }
    }) as Promise<AgentSessionState>
  }

  async deleteSession(request: DeleteAgentSessionRequest): Promise<void> {
    await this.send(createAgentDeleteSessionCommand(this.createRequestId(), request), {
      timeoutMs: this.sessionLifecycleTimeoutMs
    })
  }

  getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    return this.send(createAgentGetStateCommand(this.createRequestId(), request)) as Promise<AgentSessionState>
  }

  listSessions(): Promise<AgentSessionState[]> {
    return this.send(createAgentListSessionsCommand(this.createRequestId())) as Promise<AgentSessionState[]>
  }

  listSkills(request: ListAgentSkillsRequest): Promise<AgentSkillDiscovery[]> {
    return this.send(createAgentListSkillsCommand(this.createRequestId(), request)) as Promise<AgentSkillDiscovery[]>
  }

  async addApiKey(request: AgentAddApiKeyRequest): Promise<void> {
    await this.send(createAgentAddApiKeyCommand(this.createRequestId(), request))
  }

  async removeApiKey(request: AgentProviderRequest): Promise<void> {
    await this.send(createAgentRemoveApiKeyCommand(this.createRequestId(), request))
  }

  getAuthStatus(): Promise<ModelAuthSettings> {
    return this.send(createAgentGetAuthStatusCommand(this.createRequestId())) as Promise<ModelAuthSettings>
  }

  getAvailableModels(): Promise<AvailableModel[]> {
    return this.send(createAgentGetAvailableModelsCommand(this.createRequestId())) as Promise<AvailableModel[]>
  }

  setModel(request: SetAgentModelRequest): Promise<AgentSessionState> {
    return this.send(createAgentSetModelCommand(this.createRequestId(), request)) as Promise<AgentSessionState>
  }

  setThinkingLevel(request: SetAgentThinkingLevelRequest): Promise<AgentSessionState> {
    return this.send(createAgentSetThinkingLevelCommand(this.createRequestId(), request)) as Promise<AgentSessionState>
  }

  testAuth(request: AgentProviderRequest): Promise<AuthTestResult> {
    return this.send(createAgentTestAuthCommand(this.createRequestId(), request)) as Promise<AuthTestResult>
  }

  async loginOAuth(request: AgentProviderRequest): Promise<void> {
    await this.send(createAgentLoginOAuthCommand(this.createRequestId(), request), {
      timeoutMs: this.oauthLoginTimeoutMs
    })
  }

  async logoutOAuth(request: AgentProviderRequest): Promise<void> {
    await this.send(createAgentLogoutOAuthCommand(this.createRequestId(), request))
  }

  handleOAuthCallback(request: AgentOAuthCallbackRequest): Promise<{ handled: boolean }> {
    return this.send(createAgentHandleOAuthCallbackCommand(this.createRequestId(), request)) as Promise<{ handled: boolean }>
  }

  async resolveToolConfirmation(
    request: ResolveAgentToolConfirmationCommandRequest
  ): Promise<void> {
    await this.send(createAgentResolveToolConfirmationCommand(this.createRequestId(), request))
  }

  async prompt(request: PromptAgentSessionRequest): Promise<void> {
    await this.send(createAgentPromptCommand(this.createRequestId(), request), { timeoutMs: false })
  }

  async abort(request: AbortAgentSessionRequest): Promise<void> {
    await this.send(createAgentAbortCommand(this.createRequestId(), request), {
      timeoutMs: this.sessionLifecycleTimeoutMs
    })
  }

  onStreamingEvent(listener: (event: AgentStreamingEvent) => void): () => void {
    this.streamingEventListeners.add(listener)
    return () => this.streamingEventListeners.delete(listener)
  }

  onEvent(listener: (event: AgentStreamingEvent) => void): () => void {
    return this.onStreamingEvent(listener)
  }

  dispose(reason = new Error('agent.utilityUnavailable')): void {
    if (this.disposed) return

    this.disposed = true
    this.streamingEventListeners.clear()
    this.rejectPendingRequests(reason)
  }

  private send(
    command: AgentUtilityFrame & { type: 'agent.command'; requestId: string },
    options: SendOptions = {}
  ): Promise<AgentUtilityResult> {
    if (this.disposed) {
      return Promise.reject(new Error('agent.utilityUnavailable'))
    }

    return new Promise((resolve, reject) => {
      const timeout =
        options.timeoutMs === false
          ? undefined
          : setTimeout(() => {
              if (!this.pendingRequests.delete(command.requestId)) return
              options.onTimeout?.()
              reject(new Error('agent.utilityRequestTimedOut'))
            }, options.timeoutMs ?? this.requestTimeoutMs)

      this.pendingRequests.set(command.requestId, { resolve, reject, timeout })

      try {
        this.port.postMessage(command)
      } catch (error) {
        if (timeout) clearTimeout(timeout)
        this.pendingRequests.delete(command.requestId)
        reject(error instanceof Error ? error : new Error('agent.utilityPostMessageFailed'))
      }
    })
  }

  private handleFrame(frame: AgentUtilityFrame): void {
    if (frame.type === 'agent.command' && frame.command === 'workspaceTool.execute') {
      void this.handleWorkspaceToolCommand(frame)
      return
    }

    if (frame.type === 'agent.command' && frame.command === 'agent.openOAuthUrl') {
      void this.handleOpenOAuthUrlCommand(frame)
      return
    }

    if (frame.type === 'agent.event') {
      this.forwardEvent?.(frame)
      if (frame.event === 'agent.streaming') {
        this.emitStreamingEvent(frame.payload)
      }
      return
    }

    if (frame.type === 'agent.sessionProjectionEvent') {
      this.onProjectionEvent?.(frame)
      return
    }

    if (frame.type !== 'agent.response') return

    const pendingRequest = this.pendingRequests.get(frame.requestId)
    if (!pendingRequest) return

    this.pendingRequests.delete(frame.requestId)
    this.resolvePendingRequest(frame, pendingRequest)
  }

  private async handleWorkspaceToolCommand(frame: AgentUtilityFrame & { type: 'agent.command' }): Promise<void> {
    if (!this.executeWorkspaceTool) {
      this.port.postMessage({
        type: 'agent.response',
        requestId: frame.requestId,
        ok: false,
        sessionId: frame.sessionId,
        error: { code: 'workspace-tool-unavailable', message: 'Workspace Tool executor unavailable' }
      })
      return
    }

    try {
      const result = await this.executeWorkspaceTool(frame.payload as ExecuteWorkspaceToolRequest)
      this.port.postMessage({
        type: 'agent.response',
        requestId: frame.requestId,
        ok: true,
        sessionId: frame.sessionId,
        result
      })
    } catch (error) {
      this.port.postMessage({
        type: 'agent.response',
        requestId: frame.requestId,
        ok: false,
        sessionId: frame.sessionId,
        error: {
          code: 'workspace-tool-error',
          message: error instanceof Error ? error.message : String(error)
        }
      })
    }
  }

  private async handleOpenOAuthUrlCommand(frame: AgentUtilityFrame & { type: 'agent.command' }): Promise<void> {
    const url = typeof (frame.payload as { url?: unknown } | undefined)?.url === 'string' ? (frame.payload as { url: string }).url : ''

    try {
      if (!this.openExternal) throw new Error('agent.oauthBrowserUnavailable')
      await this.openExternal(url)
      this.port.postMessage({ type: 'agent.response', requestId: frame.requestId, ok: true, sessionId: frame.sessionId, result: undefined })
    } catch (error) {
      this.port.postMessage({
        type: 'agent.response',
        requestId: frame.requestId,
        ok: false,
        sessionId: frame.sessionId,
        error: { code: 'agent.oauthOpenExternalFailed', message: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  private emitStreamingEvent(event: AgentStreamingEvent): void {
    for (const listener of this.streamingEventListeners) listener(event)
  }

  private resolvePendingRequest(frame: AgentUtilityResponse, pendingRequest: PendingRequest): void {
    if (pendingRequest.timeout) clearTimeout(pendingRequest.timeout)

    if (frame.ok) {
      pendingRequest.resolve(frame.result)
      return
    }

    pendingRequest.reject(new Error(frame.error.message))
  }

  private rejectPendingRequests(reason: Error): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      if (pendingRequest.timeout) clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(reason)
    }
    this.pendingRequests.clear()
  }
}
