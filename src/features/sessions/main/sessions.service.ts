import log from 'electron-log/main'
import { nanoid } from 'nanoid'

import type {
  CreateProjectSessionRequest,
  ProjectSession,
  SessionGitHubSource,
  SessionStatus,
  SessionWorktree,
  ManagedChatAgentSession
} from '../shared'
import type { ResolvedAgentDefinition } from '../../../shared/agent-protocol'
import type { ThinkingLevel } from '../../../shared/model-settings'

export type StoredSession = {
  id: string
  projectId: string | null
  title: string
  status: SessionStatus
  createdAt: Date
  updatedAt: Date
  transcriptPath?: string | null
  modelProvider?: string | null
  modelId?: string | null
  thinkingLevel?: ThinkingLevel | null
  worktreePath?: string | null
  worktreeBranch?: string | null
  worktreeBaseRevision?: string | null
  sourceType?: SessionGitHubSource['type'] | null
  sourceRepositoryId?: string | null
  sourceRepositoryNodeId?: string | null
  sourceRepositoryOwner?: string | null
  sourceRepositoryName?: string | null
  sourceNumber?: number | null
  sourceUrl?: string | null
  sourceTitle?: string | null
  archivedAt?: Date | null
  managedContext?: 'knowledge-base' | 'global-chat' | null
  workspaceContextSessionId?: string | null
  agentDefinitionSnapshot?: string | null
}

export type CreateProjectAgentSessionRequest = {
  id: string
  projectId: string
  transcriptPath?: string
  modelProvider?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
  title?: string
  worktree: SessionWorktree
  source?: SessionGitHubSource
  agentDefinitionSnapshot?: ResolvedAgentDefinition
}

export type CreateManagedChatAgentSessionRequest = {
  id: string
  transcriptPath?: string
  modelProvider?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
  title: string
  managedContext: 'knowledge-base' | 'global-chat'
  agentDefinitionSnapshot?: ResolvedAgentDefinition
}

export type SessionsRepository = {
  listProjectSessions: () => Promise<StoredSession[]>
  create: (session: StoredSession) => Promise<StoredSession>
  countByProjectId: (projectId: string) => Promise<number>
  projectExists: (projectId: string) => Promise<boolean>
  findProjectById: (projectId: string) => Promise<
    | {
        id: string
        path: string
        knowledgeBasePath?: string | null
        archivedAt?: Date | null
        agentResourcesTrusted?: boolean
      }
    | undefined
  >
  updateProjectPath: (projectId: string, path: string) => Promise<void>
  hasManagedSessions: (projectId: string) => Promise<boolean>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  update: (session: StoredSession) => Promise<StoredSession>
  deleteById: (sessionId: string) => Promise<void>
  listByProjectIdIncludingArchived: (projectId: string) => Promise<StoredSession[]>
  updateMany: (sessions: StoredSession[]) => Promise<StoredSession[]>
  deleteByProjectId: (projectId: string) => Promise<void>
}

export type Clock = () => Date

type IncompleteSessionMetadataCode =
  'session.worktreeMetadataIncomplete' | 'session.sourceMetadataIncomplete'

type InvalidSessionMetadata = {
  sessionId: string
  code: IncompleteSessionMetadataCode
}

export type SessionsService = {
  listProjectSessions: () => Promise<ProjectSession[]>
  createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
  createProjectAgentSession: (request: CreateProjectAgentSessionRequest) => Promise<ProjectSession>
  createManagedChatAgentSession: (
    request: CreateManagedChatAgentSessionRequest
  ) => Promise<ManagedChatAgentSession>
  renameSession: (sessionId: string, title: string) => Promise<ProjectSession>
  archiveSession: (sessionId: string) => Promise<void>
  archiveProjectSessions: (projectId: string) => Promise<StoredSession[]>
  updateAgentModel: (
    sessionId: string,
    provider: string,
    modelId: string,
    thinkingLevel?: ThinkingLevel
  ) => Promise<void>
  updateAgentThinkingLevel: (sessionId: string, level: ThinkingLevel) => Promise<void>
}

export function createSessionsService({
  repository,
  now = () => new Date(),
  onInvalidSessionMetadata = logInvalidSessionMetadata
}: {
  repository: SessionsRepository
  now?: Clock
  onInvalidSessionMetadata?: (metadata: InvalidSessionMetadata) => void
}): SessionsService {
  return {
    async listProjectSessions() {
      const sessions: ProjectSession[] = []
      for (const storedSession of await repository.listProjectSessions()) {
        try {
          sessions.push(toProjectSession(storedSession))
        } catch (error) {
          const code = getIncompleteSessionMetadataCode(error)
          if (!code) throw error
          onInvalidSessionMetadata({ sessionId: storedSession.id, code })
        }
      }
      return sessions
    },

    async createProjectSession(request) {
      const projectId = request.projectId.trim()
      if (!(await repository.projectExists(projectId))) throw new Error('Project not found')

      const timestamp = now()
      const title = normalizeTitle(
        request.title ?? `Session ${(await repository.countByProjectId(projectId)) + 1}`
      )

      return toProjectSession(
        await repository.create({
          id: nanoid(),
          projectId,
          title,
          status: 'idle',
          createdAt: timestamp,
          updatedAt: timestamp
        })
      )
    },

    async createProjectAgentSession(request) {
      const projectId = request.projectId.trim()
      if (!(await repository.projectExists(projectId))) throw new Error('Project not found')

      const timestamp = now()
      const title = normalizeTitle(
        request.title ?? `Session ${(await repository.countByProjectId(projectId)) + 1}`
      )
      const source = request.source

      return toProjectSession(
        await repository.create({
          id: request.id.trim(),
          projectId,
          title,
          status: 'idle',
          createdAt: timestamp,
          updatedAt: timestamp,
          transcriptPath: request.transcriptPath,
          modelProvider: request.modelProvider,
          modelId: request.modelId,
          thinkingLevel: request.thinkingLevel,
          worktreePath: request.worktree.path,
          worktreeBranch: request.worktree.branch,
          worktreeBaseRevision: request.worktree.baseRevision,
          sourceType: source?.type,
          sourceRepositoryId: source?.repositoryId,
          sourceRepositoryNodeId: source?.repositoryNodeId,
          sourceRepositoryOwner: source?.repositoryOwner,
          sourceRepositoryName: source?.repositoryName,
          sourceNumber: source?.number,
          sourceUrl: source?.url,
          sourceTitle: source?.title,
          agentDefinitionSnapshot: serializeAgentDefinitionSnapshot(request.agentDefinitionSnapshot)
        })
      )
    },

    async createManagedChatAgentSession(request) {
      const timestamp = now()
      const title = normalizeTitle(request.title)

      return toManagedChatAgentSession(
        await repository.create({
          id: request.id.trim(),
          projectId: null,
          title,
          status: 'idle',
          createdAt: timestamp,
          updatedAt: timestamp,
          transcriptPath: request.transcriptPath,
          modelProvider: request.modelProvider,
          modelId: request.modelId,
          thinkingLevel: request.thinkingLevel,
          managedContext: request.managedContext,
          agentDefinitionSnapshot: serializeAgentDefinitionSnapshot(request.agentDefinitionSnapshot)
        })
      )
    },

    async renameSession(sessionId, title) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session?.projectId || session.workspaceContextSessionId) {
        throw new Error('Session not found')
      }
      const updatedSession = await repository.update({
        ...session,
        title: normalizeRenameTitle(title),
        updatedAt: now()
      })
      return toProjectSession(updatedSession)
    },

    async archiveSession(sessionId) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.update({ ...session, archivedAt: now(), updatedAt: now() })
    },

    async archiveProjectSessions(projectId) {
      const sessions = await repository.listByProjectIdIncludingArchived(projectId.trim())
      const timestamp = now()
      await repository.updateMany(
        sessions.map((session) => ({
          ...session,
          archivedAt: session.archivedAt ?? timestamp,
          updatedAt: timestamp
        }))
      )
      return sessions
    },

    async updateAgentModel(sessionId, provider, modelId, thinkingLevel) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.update({
        ...session,
        modelProvider: provider,
        modelId,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        updatedAt: now()
      })
    },

    async updateAgentThinkingLevel(sessionId, level) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.update({ ...session, thinkingLevel: level, updatedAt: now() })
    }
  }
}

function serializeAgentDefinitionSnapshot(
  agentDefinition: ResolvedAgentDefinition | undefined
): string | undefined {
  return agentDefinition ? JSON.stringify(agentDefinition) : undefined
}

function normalizeTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Session title is required')
  return normalized
}

function normalizeRenameTitle(title: string): string {
  const normalized = title.trim()
  if (!normalized) throw new Error('Session title is required')
  return normalized
}

function getIncompleteSessionMetadataCode(
  error: unknown
): IncompleteSessionMetadataCode | undefined {
  if (!(error instanceof Error)) return undefined
  if (
    error.message === 'session.worktreeMetadataIncomplete' ||
    error.message === 'session.sourceMetadataIncomplete'
  ) {
    return error.message
  }
  return undefined
}

function logInvalidSessionMetadata({ sessionId, code }: InvalidSessionMetadata): void {
  log.warn(`[sessions] Skipping Session ${sessionId}: ${code}`)
}

function toProjectSession(session: StoredSession): ProjectSession {
  if (!session.projectId) throw new Error('Project session is missing a project')
  const worktree = toSessionWorktree(session)
  const source = toSessionSource(session)

  return {
    id: session.id,
    kind: 'project',
    projectId: session.projectId,
    title: session.title,
    status: session.status,
    ...(worktree ? { worktree } : {}),
    ...(source ? { source } : {}),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}

function toSessionWorktree(session: StoredSession): SessionWorktree | undefined {
  const values = [session.worktreePath, session.worktreeBranch, session.worktreeBaseRevision]
  if (values.every((value) => !value)) return undefined
  if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) {
    throw new Error('session.worktreeMetadataIncomplete')
  }
  return {
    path: session.worktreePath,
    branch: session.worktreeBranch,
    baseRevision: session.worktreeBaseRevision
  }
}

function toSessionSource(session: StoredSession): SessionGitHubSource | undefined {
  const values = [
    session.sourceType,
    session.sourceRepositoryId,
    session.sourceRepositoryNodeId,
    session.sourceRepositoryOwner,
    session.sourceRepositoryName,
    session.sourceNumber,
    session.sourceUrl,
    session.sourceTitle
  ]
  if (values.every((value) => value === null || value === undefined)) return undefined
  if (
    !session.sourceType ||
    !session.sourceRepositoryId ||
    !session.sourceRepositoryNodeId ||
    !session.sourceRepositoryOwner ||
    !session.sourceRepositoryName ||
    typeof session.sourceNumber !== 'number' ||
    !session.sourceUrl ||
    !session.sourceTitle
  ) {
    throw new Error('session.sourceMetadataIncomplete')
  }
  return {
    type: session.sourceType,
    repositoryId: session.sourceRepositoryId,
    repositoryNodeId: session.sourceRepositoryNodeId,
    repositoryOwner: session.sourceRepositoryOwner,
    repositoryName: session.sourceRepositoryName,
    repositoryFullName: `${session.sourceRepositoryOwner}/${session.sourceRepositoryName}`,
    number: session.sourceNumber,
    url: session.sourceUrl,
    title: session.sourceTitle
  }
}

export function toManagedChatAgentSession(session: StoredSession): ManagedChatAgentSession {
  if (session.projectId) throw new Error('Workspace session must not have a project')

  return {
    id: session.id,
    kind: 'workspace',
    title: session.title,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}
