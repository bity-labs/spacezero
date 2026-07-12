import { randomUUID } from 'node:crypto'

import type {
  AgentPingRequest,
  AgentPingResponse,
  AgentUtilityFrame,
  AgentUtilityResponse
} from '../../../shared/agent-protocol'
import { createAgentPingCommand } from '../../../shared/agent-protocol'

export type AgentUtilityPort = {
  postMessage: (frame: AgentUtilityFrame) => void
  onMessage: (handler: (frame: AgentUtilityFrame) => void) => void
}

type PendingRequest = {
  resolve: (response: AgentPingResponse) => void
  reject: (error: Error) => void
}

type AgentUtilityBrokerOptions = {
  createRequestId?: () => string
}

export class AgentUtilityBroker {
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly createRequestId: () => string

  constructor(
    private readonly port: AgentUtilityPort,
    options: AgentUtilityBrokerOptions = {}
  ) {
    this.createRequestId = options.createRequestId ?? randomUUID
    this.port.onMessage((frame) => this.handleFrame(frame))
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    const requestId = this.createRequestId()
    const command = createAgentPingCommand(requestId, request)

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject })
      this.port.postMessage(command)
    })
  }

  private handleFrame(frame: AgentUtilityFrame): void {
    if (frame.type !== 'agent.response') return

    const pendingRequest = this.pendingRequests.get(frame.requestId)
    if (!pendingRequest) return

    this.pendingRequests.delete(frame.requestId)
    this.resolvePendingRequest(frame, pendingRequest)
  }

  private resolvePendingRequest(frame: AgentUtilityResponse, pendingRequest: PendingRequest): void {
    if (frame.ok) {
      pendingRequest.resolve(frame.result)
      return
    }

    pendingRequest.reject(new Error(frame.error.message))
  }
}
