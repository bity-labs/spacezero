import { resolve } from 'node:path'

import type { AgentSessionState, CreateAgentSessionRequest, GetAgentSessionStateRequest } from '../shared/agent-protocol'

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

  constructor(private readonly options: { createPiSession: CreatePiAgentSession }) {}

  async createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const projectId = request.projectId.trim()
    const cwd = resolve(request.cwd)

    if (this.sessions.has(sessionId)) throw new Error('agent.sessionAlreadyExists')

    const piSession = await this.options.createPiSession({ sessionId, projectId, cwd })
    this.sessions.set(sessionId, { projectId, cwd, piSession })

    return this.toState(sessionId, this.sessions.get(sessionId)!)
  }

  async getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('agent.sessionNotFound')

    return this.toState(sessionId, session)
  }

  async listSessions(): Promise<AgentSessionState[]> {
    return [...this.sessions.entries()].map(([sessionId, session]) => this.toState(sessionId, session))
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.piSession.dispose()
    }
    this.sessions.clear()
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
