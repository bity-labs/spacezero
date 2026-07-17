import { resolve } from 'node:path'

import type {
  AbortAgentSessionRequest,
  AgentSessionState,
  AgentStreamingEvent,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest,
  PromptAgentSessionRequest,
  ResolveAgentToolConfirmationCommandRequest
} from '../shared/agent-protocol'
import type { AgentTranscriptMessage } from '../shared/agent-session-projection.model'
import type { ThinkingLevel, SetAgentModelRequest, SetAgentThinkingLevelRequest } from '../shared/model-settings'
import type { WorkspaceToolAgentDescriptor } from '../shared/workspace-tool-protocol'
import type { AgentSkillDescriptor, AgentSkillPath } from '../features/agent-workspace/shared/agent-skill.model'

export type CreatedPiAgentSession = {
  sessionId: string
  sessionFile: string | undefined
  isStreaming: boolean
  modelProvider: string
  modelId: string
  thinkingLevel: ThinkingLevel | undefined
  systemPrompt?: string
  skills?: AgentSkillDescriptor[]
  setModel: (request: { provider: string; modelId: string }) => Promise<void>
  setThinkingLevel: (level: ThinkingLevel) => Promise<void> | void
  prompt: (message: string) => Promise<void>
  abort: () => Promise<void>
  subscribe: (listener: (event: AgentStreamingEvent) => void) => () => void
  dispose: () => void
  getTranscriptSnapshot: () => AgentTranscriptMessage[]
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
  kind: 'project' | 'workspace'
  projectId: string | null
  cwd: string
  workspaceTools: WorkspaceToolAgentDescriptor[] | undefined
  appendSystemPrompt: string[] | undefined
  skillPaths: AgentSkillPath[] | undefined
  disabledGlobalSkillPaths: string[] | undefined
  piSession: CreatedPiAgentSession
  unsubscribe: () => void
  lastAccessedAt: number
}

type DormantAgentSession = {
  kind: 'project' | 'workspace'
  projectId: string | null
  cwd: string
  workspaceTools: WorkspaceToolAgentDescriptor[] | undefined
  appendSystemPrompt: string[] | undefined
  skillPaths: AgentSkillPath[] | undefined
  disabledGlobalSkillPaths: string[] | undefined
  transcriptPath: string | undefined
  modelProvider: string | undefined
  modelId: string | undefined
  thinkingLevel: ThinkingLevel | undefined
  skills?: AgentSkillDescriptor[]
  lastAccessedAt: number
}

type AgentSessionRegistryOptions = {
  createPiSession: CreatePiAgentSession
  maxLiveSessions?: number
  now?: () => number
  onEvent?: (event: AgentSessionRegistryEvent) => void
  onStreamingEvent?: (event: AgentStreamingEvent) => void
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
        const unsubscribe = piSession.subscribe((event) => this.forwardStreamingEvent(sessionId, event))
        this.sessions.set(sessionId, {
          kind: normalizedRequest.kind ?? 'project',
          projectId: normalizedRequest.projectId,
          cwd: normalizedRequest.cwd,
          workspaceTools: normalizedRequest.workspaceTools,
          appendSystemPrompt: normalizedRequest.appendSystemPrompt,
          skillPaths: normalizedRequest.skillPaths,
          disabledGlobalSkillPaths: normalizedRequest.disabledGlobalSkillPaths,
          piSession,
          unsubscribe,
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

  async prompt(request: PromptAgentSessionRequest): Promise<void> {
    const sessionId = request.sessionId.trim()
    const message = request.message.trim()
    if (!message) throw new Error('agent.emptyPrompt')

    const session = await this.getLiveSession(sessionId)
    session.lastAccessedAt = this.now()
    await session.piSession.prompt(message)
  }

  async abort(request: AbortAgentSessionRequest): Promise<void> {
    const sessionId = request.sessionId.trim()
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('agent.sessionNotFound')

    session.lastAccessedAt = this.now()
    await session.piSession.abort()
  }

  async setModel(request: SetAgentModelRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const session = await this.getLiveSession(sessionId)
    session.lastAccessedAt = this.now()
    await session.piSession.setModel({ provider: request.provider, modelId: request.modelId })
    return this.toLiveState(sessionId, session)
  }

  async setThinkingLevel(request: SetAgentThinkingLevelRequest): Promise<AgentSessionState> {
    const sessionId = request.sessionId.trim()
    const session = await this.getLiveSession(sessionId)
    session.lastAccessedAt = this.now()
    await session.piSession.setThinkingLevel(request.level)
    return this.toLiveState(sessionId, session)
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

    session.unsubscribe()
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
      session.unsubscribe()
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
    const kind = request.kind ?? 'project'
    const projectId = request.projectId?.trim() ?? null
    if (kind === 'project' && !projectId) throw new Error('agent.projectSessionMissingProject')
    if (kind === 'workspace' && projectId) throw new Error('agent.workspaceSessionHasProject')

    return {
      sessionId: request.sessionId.trim(),
      kind,
      projectId,
      cwd: resolve(request.cwd),
      transcriptPath: request.transcriptPath,
      workspaceTools: request.workspaceTools,
      appendSystemPrompt: request.appendSystemPrompt,
      ...(request.skillPaths ? { skillPaths: request.skillPaths } : {}),
      ...(request.disabledGlobalSkillPaths
        ? { disabledGlobalSkillPaths: request.disabledGlobalSkillPaths.map((path) => resolve(path)) }
        : {}),
      ...(request.defaultModel ? { defaultModel: request.defaultModel } : {}),
      ...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel } : {})
    }
  }

  private async getLiveSession(sessionId: string): Promise<RegisteredAgentSession> {
    const session = this.sessions.get(sessionId)
    if (session) return session

    if (!this.dormantSessions.has(sessionId)) throw new Error('agent.sessionNotFound')

    return this.enqueueLifecycle(async () => {
      const liveSession = this.sessions.get(sessionId)
      if (liveSession) return liveSession

      const dormantSession = this.dormantSessions.get(sessionId)
      if (!dormantSession) throw new Error('agent.sessionNotFound')

      this.rehydratingSessionIds.add(sessionId)
      try {
        this.throwIfDisposed()
        await this.rehydrateSession(sessionId, dormantSession)
        const rehydratedSession = this.sessions.get(sessionId)
        if (!rehydratedSession) throw new Error('agent.sessionNotFound')
        return rehydratedSession
      } finally {
        this.rehydratingSessionIds.delete(sessionId)
      }
    })
  }

  private async rehydrateSession(
    sessionId: string,
    dormantSession: DormantAgentSession
  ): Promise<AgentSessionState> {
    this.findSuspensionCandidate()
    const piSession = await this.options.createPiSession({
      sessionId,
      kind: dormantSession.kind,
      projectId: dormantSession.projectId,
      cwd: dormantSession.cwd,
      transcriptPath: dormantSession.transcriptPath,
      workspaceTools: dormantSession.workspaceTools,
      appendSystemPrompt: dormantSession.appendSystemPrompt,
      ...(dormantSession.skillPaths ? { skillPaths: dormantSession.skillPaths } : {}),
      ...(dormantSession.disabledGlobalSkillPaths
        ? { disabledGlobalSkillPaths: dormantSession.disabledGlobalSkillPaths }
        : {}),
      ...(dormantSession.modelProvider && dormantSession.modelId
        ? {
            defaultModel: {
              providerId: dormantSession.modelProvider,
              modelId: dormantSession.modelId
            }
          }
        : {}),
      thinkingLevel: dormantSession.thinkingLevel
    })

    if (this.disposed) {
      piSession.dispose()
      throw new Error('agent.sessionRegistryDisposed')
    }

    const liveSession: RegisteredAgentSession = {
      kind: dormantSession.kind,
      projectId: dormantSession.projectId,
      cwd: dormantSession.cwd,
      workspaceTools: dormantSession.workspaceTools,
      appendSystemPrompt: dormantSession.appendSystemPrompt,
      skillPaths: dormantSession.skillPaths,
      disabledGlobalSkillPaths: dormantSession.disabledGlobalSkillPaths,
      piSession,
      unsubscribe: piSession.subscribe((event) => this.forwardStreamingEvent(sessionId, event)),
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
      kind: session.kind,
      projectId: session.projectId,
      cwd: session.cwd,
      workspaceTools: session.workspaceTools,
      appendSystemPrompt: session.appendSystemPrompt,
      skillPaths: session.skillPaths,
      disabledGlobalSkillPaths: session.disabledGlobalSkillPaths,
      transcriptPath: session.piSession.sessionFile,
      modelProvider: session.piSession.modelProvider,
      modelId: session.piSession.modelId,
      thinkingLevel: session.piSession.thinkingLevel,
      skills: session.piSession.skills,
      lastAccessedAt: session.lastAccessedAt
    }
    const state = this.toDormantState(sessionId, dormantSession)

    session.unsubscribe()
    session.piSession.dispose()
    this.sessions.delete(sessionId)
    this.dormantSessions.set(sessionId, dormantSession)
    this.onEvent?.({ event: 'agent.sessionSuspended', sessionId, state })
  }

  private forwardStreamingEvent(sessionId: string, event: AgentStreamingEvent): void {
    this.options.onStreamingEvent?.({ ...event, sessionId })
  }

  private toLiveState(sessionId: string, session: RegisteredAgentSession): AgentSessionState {
    const transcriptSnapshot = session.piSession.getTranscriptSnapshot()

    return {
      sessionId,
      kind: session.kind,
      projectId: session.projectId,
      cwd: session.cwd,
      status: session.piSession.isStreaming ? 'running' : 'idle',
      live: true,
      transcriptPath: session.piSession.sessionFile,
      modelProvider: session.piSession.modelProvider,
      modelId: session.piSession.modelId,
      thinkingLevel: session.piSession.thinkingLevel,
      ...(session.piSession.skills ? { skills: session.piSession.skills } : {}),
      ...(transcriptSnapshot.length > 0 ? { transcriptSnapshot } : {})
    }
  }

  private toDormantState(sessionId: string, session: DormantAgentSession): AgentSessionState {
    return {
      sessionId,
      kind: session.kind,
      projectId: session.projectId,
      cwd: session.cwd,
      status: 'idle',
      live: false,
      transcriptPath: session.transcriptPath,
      modelProvider: session.modelProvider,
      modelId: session.modelId,
      thinkingLevel: session.thinkingLevel,
      ...(session.skills ? { skills: session.skills } : {})
    }
  }
}
