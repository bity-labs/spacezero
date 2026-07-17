import { nanoid } from 'nanoid'

import type { CreateProjectSessionRequest, ProjectSession, SessionStatus, WorkspaceSession } from '../shared'
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
  archivedAt?: Date | null
}

export type CreateProjectAgentSessionRequest = {
  id: string
  projectId: string
  transcriptPath?: string
  modelProvider?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
}

export type CreateWorkspaceAgentSessionRequest = {
  id: string
  transcriptPath?: string
  modelProvider?: string
  modelId?: string
  thinkingLevel?: ThinkingLevel
}

export type SessionsRepository = {
  listProjectSessions: () => Promise<StoredSession[]>
  listWorkspaceSessions: () => Promise<StoredSession[]>
  create: (session: StoredSession) => Promise<StoredSession>
  countByProjectId: (projectId: string) => Promise<number>
  countWorkspaceSessions: () => Promise<number>
  projectExists: (projectId: string) => Promise<boolean>
  findProjectById: (
    projectId: string
  ) => Promise<{ id: string; path: string; knowledgeBasePath?: string | null } | undefined>
  findSessionById: (sessionId: string) => Promise<StoredSession | undefined>
  update: (session: StoredSession) => Promise<StoredSession>
  deleteById: (sessionId: string) => Promise<void>
  listByProjectIdIncludingArchived: (projectId: string) => Promise<StoredSession[]>
  updateMany: (sessions: StoredSession[]) => Promise<StoredSession[]>
  deleteByProjectId: (projectId: string) => Promise<void>
}

export type Clock = () => Date

export type SessionsService = {
  listProjectSessions: () => Promise<ProjectSession[]>
  listWorkspaceSessions: () => Promise<WorkspaceSession[]>
  createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
  createProjectAgentSession: (request: CreateProjectAgentSessionRequest) => Promise<ProjectSession>
  createWorkspaceAgentSession: (request: CreateWorkspaceAgentSessionRequest) => Promise<WorkspaceSession>
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<StoredSession>
  archiveProjectSessions: (projectId: string) => Promise<StoredSession[]>
  deleteProjectSessions: (projectId: string) => Promise<StoredSession[]>
  updateAgentModel: (sessionId: string, provider: string, modelId: string) => Promise<void>
  updateAgentThinkingLevel: (sessionId: string, level: ThinkingLevel) => Promise<void>
}

export function createSessionsService({
  repository,
  now = () => new Date()
}: {
  repository: SessionsRepository
  now?: Clock
}): SessionsService {
  return {
    async listProjectSessions() {
      return (await repository.listProjectSessions()).map(toProjectSession)
    },

    async listWorkspaceSessions() {
      return (await repository.listWorkspaceSessions()).map(toWorkspaceSession)
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
      const title = `Session ${(await repository.countByProjectId(projectId)) + 1}`

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
          thinkingLevel: request.thinkingLevel
        })
      )
    },

    async createWorkspaceAgentSession(request) {
      const timestamp = now()
      const title = `Workspace Session ${(await repository.countWorkspaceSessions()) + 1}`

      return toWorkspaceSession(
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
          thinkingLevel: request.thinkingLevel
        })
      )
    },

    async archiveSession(sessionId) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.update({ ...session, archivedAt: now(), updatedAt: now() })
    },

    async deleteSession(sessionId) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.deleteById(session.id)
      return session
    },

    async archiveProjectSessions(projectId) {
      const sessions = await repository.listByProjectIdIncludingArchived(projectId.trim())
      const timestamp = now()
      await repository.updateMany(
        sessions.map((session) => ({ ...session, archivedAt: session.archivedAt ?? timestamp, updatedAt: timestamp }))
      )
      return sessions
    },

    async deleteProjectSessions(projectId) {
      const sessions = await repository.listByProjectIdIncludingArchived(projectId.trim())
      await repository.deleteByProjectId(projectId.trim())
      return sessions
    },

    async updateAgentModel(sessionId, provider, modelId) {
      const session = await repository.findSessionById(sessionId.trim())
      if (!session) throw new Error('Session not found')
      await repository.update({
        ...session,
        modelProvider: provider,
        modelId,
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

function normalizeTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('Session title is required')
  return normalized
}

function toProjectSession(session: StoredSession): ProjectSession {
  if (!session.projectId) throw new Error('Project session is missing a project')

  return {
    id: session.id,
    kind: 'project',
    projectId: session.projectId,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}

function toWorkspaceSession(session: StoredSession): WorkspaceSession {
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
