import { randomUUID } from 'node:crypto'

import type {
  AgentPingRequest,
  AgentPingResponse,
  AgentSessionState,
  AgentUtilityFrame,
  AgentUtilityResponse,
  AgentUtilityResult,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest
} from '../../../shared/agent-protocol'
import {
  createAgentCreateSessionCommand,
  createAgentDeleteSessionCommand,
  createAgentGetStateCommand,
  createAgentListSessionsCommand,
  createAgentPingCommand
} from '../../../shared/agent-protocol'
import type { ExecuteWorkspaceToolRequest } from '../../../shared/workspace-tool-protocol'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS = 60_000

export type AgentUtilityPort = {
  postMessage: (frame: AgentUtilityFrame) => void
  onMessage: (handler: (frame: AgentUtilityFrame) => void) => void
  onClose: (handler: () => void) => void
}

type PendingRequest = {
  resolve: (response: AgentUtilityResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

type AgentUtilityBrokerOptions = {
  createRequestId?: () => string
  requestTimeoutMs?: number
  sessionLifecycleTimeoutMs?: number
  onEvent?: (event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void
  executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<AgentUtilityResult>
}

type SendOptions = {
  timeoutMs?: number
  onTimeout?: () => void
}

export class AgentUtilityBroker {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly createRequestId: () => string
  private readonly requestTimeoutMs: number
  private readonly sessionLifecycleTimeoutMs: number
  private readonly onEvent: ((event: Extract<AgentUtilityFrame, { type: 'agent.event' }>) => void) | undefined
  private readonly executeWorkspaceTool?: (request: ExecuteWorkspaceToolRequest) => Promise<AgentUtilityResult>
  private disposed = false

  constructor(
    private readonly port: AgentUtilityPort,
    options: AgentUtilityBrokerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.sessionLifecycleTimeoutMs = options.sessionLifecycleTimeoutMs ?? DEFAULT_SESSION_LIFECYCLE_TIMEOUT_MS
    this.onEvent = options.onEvent
    this.executeWorkspaceTool = options.executeWorkspaceTool
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

  dispose(reason = new Error('agent.utilityUnavailable')): void {
    if (this.disposed) return

    this.disposed = true
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
      const timeout = setTimeout(() => {
        if (!this.pendingRequests.delete(command.requestId)) return
        options.onTimeout?.()
        reject(new Error('agent.utilityRequestTimedOut'))
      }, options.timeoutMs ?? this.requestTimeoutMs)

      this.pendingRequests.set(command.requestId, { resolve, reject, timeout })

      try {
        this.port.postMessage(command)
      } catch (error) {
        clearTimeout(timeout)
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

    if (frame.type === 'agent.event') {
      this.onEvent?.(frame)
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

  private resolvePendingRequest(frame: AgentUtilityResponse, pendingRequest: PendingRequest): void {
    clearTimeout(pendingRequest.timeout)

    if (frame.ok) {
      pendingRequest.resolve(frame.result)
      return
    }

    pendingRequest.reject(new Error(frame.error.message))
  }

  private rejectPendingRequests(reason: Error): void {
    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(reason)
    }

    this.pendingRequests.clear()
  }
}
