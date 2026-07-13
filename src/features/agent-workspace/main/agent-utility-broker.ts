import { randomUUID } from 'node:crypto'

import type {
  AbortAgentSessionRequest,
  AgentPingRequest,
  AgentPingResponse,
  AgentSessionState,
  AgentStreamingEvent,
  AgentUtilityFrame,
  AgentUtilityResponse,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  PromptAgentSessionRequest,
  ResolveAgentToolConfirmationCommandRequest
} from '../../../shared/agent-protocol'
import {
  createAgentAbortCommand,
  createAgentCreateSessionCommand,
  createAgentDeleteSessionCommand,
  createAgentGetStateCommand,
  createAgentListSessionsCommand,
  createAgentPingCommand,
  createAgentPromptCommand,
  createAgentResolveToolConfirmationCommand
} from '../../../shared/agent-protocol'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS = 60_000

export type AgentUtilityPort = {
  postMessage: (frame: AgentUtilityFrame) => void
  onMessage: (handler: (frame: AgentUtilityFrame) => void) => void
  onClose: (handler: () => void) => void
}

type AgentUtilityResult = AgentPingResponse | AgentSessionState | AgentSessionState[] | undefined

type PendingRequest = {
  resolve: (response: AgentUtilityResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout | undefined
}

type AgentUtilityBrokerOptions = {
  createRequestId?: () => string
  requestTimeoutMs?: number
  sessionLifecycleTimeoutMs?: number
  onEvent?: (event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void
  onProjectionEvent?: (event: Extract<AgentUtilityFrame, { type: 'agent.sessionProjectionEvent' }>) => void
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
  private readonly forwardEvent: ((event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void) | undefined
  private readonly onProjectionEvent:
    | ((event: Extract<AgentUtilityFrame, { type: 'agent.sessionProjectionEvent' }>) => void)
    | undefined
  private readonly streamingEventListeners = new Set<(event: AgentStreamingEvent) => void>()
  private disposed = false

  constructor(
    private readonly port: AgentUtilityPort,
    options: AgentUtilityBrokerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.sessionLifecycleTimeoutMs = options.sessionLifecycleTimeoutMs ?? DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS
    this.forwardEvent = options.onEvent
    this.onProjectionEvent = options.onProjectionEvent
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
