import { resolve } from 'node:path'

import type {
  AgentSessionState,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest
} from '../shared/agent-protocol'

export type CreatedPiAgentSession = {
  sessionId: string
  sessionFile: string | undefined
  isStreaming: boolean
  modelProvider: string
  modelId: string
  dispose: () => void
}

export type CreatePiAgentSession = (request: CreateAgentSessionRequest) => Promise<CreatedPiAgentSession>

type RegisteredAgentSession = {
  projectId: string
  cwd: string
  piSession: CreatedPiAgentSession
}

export class AgentSessionRegistry {
  private readonly sessions = new Map<string, RegisteredAgentSession>()
  private readonly creatingSessionIds = new Set<string>()
  private readonly pendingDeleteSessionIds = new Set<string>()

  constructor(private readonly options: { createPiSession: CreatePiAgentSession }) {}

  async createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const projectId = request.projectId.trim()
    const cwd = resolve(request.cwd)

    if (this.sessions.has(sessionId) || this.creatingSessionIds.has(sessionId)) {
      throw new Error('agent.sessionAlreadyExists')
    }

    this.creatingSessionIds.add(sessionId)
    try {
      const piSession = await this.options.createPiSession({ sessionId, projectId, cwd })

      if (this.pendingDeleteSessionIds.delete(sessionId)) {
        piSession.dispose()
        throw new Error('agent.sessionCreationCancelled')
      }

      this.sessions.set(sessionId, { projectId, cwd, piSession })

      return this.toState(sessionId, this.sessions.get(sessionId)!)
    } catch (error) {
      this.pendingDeleteSessionIds.delete(sessionId)
      throw error
    } finally {
      this.creatingSessionIds.delete(sessionId)
    }
  }

  async getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('agent.sessionNotFound')

    return this.toState(sessionId, session)
  }

  async deleteSession(request: DeleteAgentSessionRequest): Promise<void> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (!session) {
      if (this.creatingSessionIds.has(sessionId)) this.pendingDeleteSessionIds.add(sessionId)
      return
    }

    session.piSession.dispose()
    this.sessions.delete(sessionId)
    this.pendingDeleteSessionIds.delete(sessionId)
  }

  async listSessions(): Promise<AgentSessionState[]> {
    return [...this.sessions.entries()].map(([sessionId, session]) => this.toState(sessionId, session))
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.piSession.dispose()
    }
    this.sessions.clear()
    this.creatingSessionIds.clear()
    this.pendingDeleteSessionIds.clear()
  }

  private toState(sessionId: string, session: RegisteredAgentSession): AgentSessionState {
    return {
      sessionId,
      projectId: session.projectId,
      cwd: session.cwd,
      status: session.piSession.isStreaming ? 'running' : 'idle',
      transcriptPath: session.piSession.sessionFile,
      modelProvider: session.piSession.modelProvider,
      modelId: session.piSession.modelId
    }
  }
}
