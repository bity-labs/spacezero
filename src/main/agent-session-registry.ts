import { resolve } from 'node:path'

import type {
  AgentSessionState,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  ResolveAgentToolConfirmationCommandRequest
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

export type AgentSessionRegistryEvent =
  | {
      event: 'agent.sessionSuspended'
      sessionId: string
      state: AgentSessionState
    }
  | {
      event: 'agent.sessionRehydrated'
      sessionId: string
      state: AgentSessionState
    }

type RegisteredAgentSession = {
  projectId: string
  cwd: string
  piSession: CreatedPiAgentSession
  lastAccessedAt: number
}

type DormantAgentSession = {
  projectId: string
  cwd: string
  transcriptPath: string | undefined
  modelProvider: string | undefined
  modelId: string | undefined
  lastAccessedAt: number
}

type AgentSessionRegistryOptions = {
  createPiSession: CreatePiAgentSession
  maxLiveSessions?: number
  now?: () => number
  onEvent?: (event: AgentSessionRegistryEvent) => void
}

const DEFAULT_MAX_LIVE_SESSIONS = 4

export class AgentSessionRegistry {
  private readonly sessions = new Map<string, RegisteredAgentSession>()
  private readonly dormantSessions = new Map<string, DormantAgentSession>()
  private readonly creatingSessionIds = new Set<string>()
  private readonly rehydratingSessionIds = new Set<string>()
  private readonly pendingDeleteSessionIds = new Set<string>()
  private lifecycleQueue: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly maxLiveSessions: number
  private readonly now: () => number
  private readonly onEvent: ((event: AgentSessionRegistryEvent) => void) | undefined

  constructor(private readonly options: AgentSessionRegistryOptions) {
    this.maxLiveSessions = Math.max(1, Math.floor(options.maxLiveSessions ?? DEFAULT_MAX_LIVE_SESSIONS))
    this.now = options.now ?? Date.now
    this.onEvent = options.onEvent
  }

  async createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    const normalizedRequest = this.normalizeCreateRequest(request)
    const { sessionId } = normalizedRequest

    if (
      this.sessions.has(sessionId) ||
      this.dormantSessions.has(sessionId) ||
      this.creatingSessionIds.has(sessionId)
    ) {
      throw new Error('agent.sessionAlreadyExists')
    }

    this.creatingSessionIds.add(sessionId)
    return this.enqueueLifecycle(async () => {
      let piSession: CreatedPiAgentSession | undefined
      try {
        this.throwIfDisposed()
        this.findSuspensionCandidate()
        piSession = await this.options.createPiSession(normalizedRequest)

        if (this.disposed) {
          piSession.dispose()
          piSession = undefined
          throw new Error('agent.sessionRegistryDisposed')
        }

        if (this.pendingDeleteSessionIds.delete(sessionId)) {
          piSession.dispose()
          piSession = undefined
          throw new Error('agent.sessionCreationCancelled')
        }

        this.suspendCandidateIfNeeded()
        this.sessions.set(sessionId, {
          projectId: normalizedRequest.projectId,
          cwd: normalizedRequest.cwd,
          piSession,
          lastAccessedAt: this.now()
        })

        return this.toLiveState(sessionId, this.sessions.get(sessionId)!)
      } catch (error) {
        this.pendingDeleteSessionIds.delete(sessionId)
        if (piSession) piSession.dispose()
        throw error
      } finally {
        this.creatingSessionIds.delete(sessionId)
      }
    })
  }

  async getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastAccessedAt = this.now()
      return this.toLiveState(sessionId, session)
    }

    if (!this.dormantSessions.has(sessionId)) throw new Error('agent.sessionNotFound')

    return this.enqueueLifecycle(async () => {
      const liveSession = this.sessions.get(sessionId)
      if (liveSession) {
        liveSession.lastAccessedAt = this.now()
        return this.toLiveState(sessionId, liveSession)
      }

      const dormantSession = this.dormantSessions.get(sessionId)
      if (!dormantSession) throw new Error('agent.sessionNotFound')

      this.rehydratingSessionIds.add(sessionId)
      try {
        this.throwIfDisposed()
        return await this.rehydrateSession(sessionId, dormantSession)
      } finally {
        this.rehydratingSessionIds.delete(sessionId)
      }
    })
  }

  async deleteSession(request: DeleteAgentSessionRequest): Promise<void> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (!session) {
      this.dormantSessions.delete(sessionId)
      if (this.creatingSessionIds.has(sessionId) || this.rehydratingSessionIds.has(sessionId)) {
        this.pendingDeleteSessionIds.add(sessionId)
      }
      return
    }

    session.piSession.dispose()
    this.sessions.delete(sessionId)
    this.dormantSessions.delete(sessionId)
    this.pendingDeleteSessionIds.delete(sessionId)
  }

  async listSessions(): Promise<AgentSessionState[]> {
    return [
      ...[...this.sessions.entries()].map(([sessionId, session]) => this.toLiveState(sessionId, session)),
      ...[...this.dormantSessions.entries()].map(([sessionId, session]) =>
        this.toDormantState(sessionId, session)
      )
    ].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
  }

  async resolveToolConfirmation(
    request: ResolveAgentToolConfirmationCommandRequest
  ): Promise<void> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastAccessedAt = this.now()
      throw new Error('agent.toolConfirmationResolverUnavailable')
    }

    if (!this.dormantSessions.has(sessionId)) throw new Error('agent.sessionNotFound')
    throw new Error('agent.toolConfirmationResolverUnavailable')
  }

  dispose(): void {
    this.disposed = true
    for (const session of this.sessions.values()) {
      session.piSession.dispose()
    }
    this.sessions.clear()
    this.dormantSessions.clear()
    this.creatingSessionIds.clear()
    this.rehydratingSessionIds.clear()
    this.pendingDeleteSessionIds.clear()
  }

  private throwIfDisposed(): void {
    if (this.disposed) throw new Error('agent.sessionRegistryDisposed')
  }

  private normalizeCreateRequest(request: CreateAgentSessionRequest): CreateAgentSessionRequest {
    return {
      sessionId: request.sessionId.trim(),
      projectId: request.projectId.trim(),
      cwd: resolve(request.cwd),
      transcriptPath: request.transcriptPath
    }
  }

  private async rehydrateSession(
    sessionId: string,
    dormantSession: DormantAgentSession
  ): Promise<AgentSessionState> {
    this.findSuspensionCandidate()
    const piSession = await this.options.createPiSession({
      sessionId,
      projectId: dormantSession.projectId,
      cwd: dormantSession.cwd,
      transcriptPath: dormantSession.transcriptPath
    })

    if (this.disposed) {
      piSession.dispose()
      throw new Error('agent.sessionRegistryDisposed')
    }

    const liveSession: RegisteredAgentSession = {
      projectId: dormantSession.projectId,
      cwd: dormantSession.cwd,
      piSession,
      lastAccessedAt: this.now()
    }

    if (this.pendingDeleteSessionIds.delete(sessionId) || this.dormantSessions.get(sessionId) !== dormantSession) {
      piSession.dispose()
      throw new Error('agent.sessionRehydrationCancelled')
    }

    try {
      this.suspendCandidateIfNeeded()
    } catch (error) {
      piSession.dispose()
      throw error
    }

    this.dormantSessions.delete(sessionId)
    this.sessions.set(sessionId, liveSession)

    const state = this.toLiveState(sessionId, liveSession)
    this.onEvent?.({ event: 'agent.sessionRehydrated', sessionId, state })
    return state
  }

  private enqueueLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleQueue.then(operation, operation)
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private findSuspensionCandidate(): [string, RegisteredAgentSession] | undefined {
    if (this.sessions.size < this.maxLiveSessions) return undefined

    const candidate = [...this.sessions.entries()]
      .filter(([, session]) => !session.piSession.isStreaming)
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt)[0]

    if (!candidate) throw new Error('agent.concurrentSessionLimitReached')
    return candidate
  }

  private suspendCandidateIfNeeded(): void {
    if (this.sessions.size < this.maxLiveSessions) return

    const candidateToSuspend = this.findSuspensionCandidate()
    if (!candidateToSuspend) return

    const [sessionId, session] = candidateToSuspend
    const dormantSession: DormantAgentSession = {
      projectId: session.projectId,
      cwd: session.cwd,
      transcriptPath: session.piSession.sessionFile,
      modelProvider: session.piSession.modelProvider,
      modelId: session.piSession.modelId,
      lastAccessedAt: session.lastAccessedAt
    }
    const state = this.toDormantState(sessionId, dormantSession)

    session.piSession.dispose()
    this.sessions.delete(sessionId)
    this.dormantSessions.set(sessionId, dormantSession)
    this.onEvent?.({ event: 'agent.sessionSuspended', sessionId, state })
  }

  private toLiveState(sessionId: string, session: RegisteredAgentSession): AgentSessionState {
    return {
      sessionId,
      projectId: session.projectId,
      cwd: session.cwd,
      status: session.piSession.isStreaming ? 'running' : 'idle',
      live: true,
      transcriptPath: session.piSession.sessionFile,
      modelProvider: session.piSession.modelProvider,
      modelId: session.piSession.modelId
    }
  }

  private toDormantState(sessionId: string, session: DormantAgentSession): AgentSessionState {
    return {
      sessionId,
      projectId: session.projectId,
      cwd: session.cwd,
      status: 'idle',
      live: false,
      transcriptPath: session.transcriptPath,
      modelProvider: session.modelProvider,
      modelId: session.modelId
    }
  }
}
