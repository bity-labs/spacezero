import { nanoid } from 'nanoid'

import type { CreateProjectSessionRequest, ProjectSession, SessionStatus } from '../shared'

export type StoredSession = {
  id: string
  projectId: string | null
  title: string
  status: SessionStatus
  createdAt: Date
  updatedAt: Date
}

export type SessionsRepository = {
  listProjectSessions: () => Promise<StoredSession[]>
  create: (session: StoredSession) => Promise<StoredSession>
  countByProjectId: (projectId: string) => Promise<number>
  projectExists: (projectId: string) => Promise<boolean>
}

export type Clock = () => Date

export type SessionsService = {
  listProjectSessions: () => Promise<ProjectSession[]>
  createProjectSession: (request: CreateProjectSessionRequest) => Promise<ProjectSession>
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
    projectId: session.projectId,
    title: session.title,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}
