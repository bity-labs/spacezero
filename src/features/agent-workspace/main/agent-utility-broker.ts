import { randomUUID } from 'node:crypto'

import type {
  AgentPingRequest,
  AgentPingResponse,
  AgentUtilityFrame,
  AgentUtilityResponse
} from '../../../shared/agent-protocol'
import { createAgentPingCommand } from '../../../shared/agent-protocol'

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export type AgentUtilityPort = {
  postMessage: (frame: AgentUtilityFrame) => void
  onMessage: (handler: (frame: AgentUtilityFrame) => void) => void
  onClose: (handler: () => void) => void
}

type PendingRequest = {
  resolve: (response: AgentPingResponse) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

type AgentUtilityBrokerOptions = {
  createRequestId?: () => string
  requestTimeoutMs?: number
}

export class AgentUtilityBroker {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly createRequestId: () => string
  private readonly requestTimeoutMs: number
  private disposed = false

  constructor(
    private readonly port: AgentUtilityPort,
    options: AgentUtilityBrokerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.port.onMessage((frame) => this.handleFrame(frame))
    this.port.onClose(() => this.dispose(new Error('agent.utilityPortClosed')))
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    if (this.disposed) {
      return Promise.reject(new Error('agent.utilityUnavailable'))
    }

    const requestId = this.createRequestId()
    const command = createAgentPingCommand(requestId, request)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pendingRequests.delete(requestId)) return
        reject(new Error('agent.utilityRequestTimedOut'))
      }, this.requestTimeoutMs)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })

      try {
        this.port.postMessage(command)
      } catch (error) {
        clearTimeout(timeout)
        this.pendingRequests.delete(requestId)
        reject(error instanceof Error ? error : new Error('agent.utilityPostMessageFailed'))
      }
    })
  }

  dispose(reason = new Error('agent.utilityUnavailable')): void {
    if (this.disposed) return

    this.disposed = true
    this.rejectPendingRequests(reason)
  }

  private handleFrame(frame: AgentUtilityFrame): void {
    if (frame.type !== 'agent.response') return

    const pendingRequest = this.pendingRequests.get(frame.requestId)
    if (!pendingRequest) return

    this.pendingRequests.delete(frame.requestId)
    this.resolvePendingRequest(frame, pendingRequest)
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
