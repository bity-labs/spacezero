import { describe, expect, it } from 'vitest'

import { createSessionsService, type SessionsRepository, type StoredSession } from './sessions.service'

function createMemoryRepository({
  projectIds = ['project-1'],
  sessions = []
}: {
  projectIds?: string[]
  sessions?: StoredSession[]
} = {}): SessionsRepository {
  const projects = new Set(projectIds)
  const storedSessions = [...sessions]

  return {
    async listProjectSessions() {
      return [...storedSessions]
        .filter((session) => session.projectId !== null)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    },
    async listWorkspaceSessions() {
      return [...storedSessions]
        .filter((session) => session.projectId === null)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    },
    async create(session) {
      storedSessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return storedSessions.filter((session) => session.projectId === projectId).length
    },
    async countWorkspaceSessions() {
      return storedSessions.filter((session) => session.projectId === null).length
    },
    async projectExists(projectId) {
      return projects.has(projectId)
    },
    async findProjectById(projectId) {
      if (!projects.has(projectId)) return undefined
      return { id: projectId, path: `/tmp/${projectId}` }
    },
    async findSessionById(sessionId) {
      return storedSessions.find((session) => session.id === sessionId)
    },
    async update(session) {
      const index = storedSessions.findIndex((item) => item.id === session.id)
      if (index >= 0) storedSessions[index] = session
      return session
    },
    async deleteById(sessionId) {
      const index = storedSessions.findIndex((session) => session.id === sessionId)
      if (index >= 0) storedSessions.splice(index, 1)
    }
  }
}

describe('createSessionsService', () => {
  it('archives sessions so active lists no longer include them', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const archiveTime = new Date('2026-07-11T00:00:00.000Z')
    let currentTime = now
    const repository = createMemoryRepository({
      sessions: [
        {
          id: 'agent-session-1',
          projectId: 'project-1',
          title: 'Session 1',
          status: 'idle',
          createdAt: now,
          updatedAt: now
        }
      ]
    })
    const service = createSessionsService({ repository, now: () => currentTime })

    currentTime = archiveTime
    await service.archiveSession('agent-session-1')

    await expect(repository.findSessionById('agent-session-1')).resolves.toMatchObject({
      archivedAt: archiveTime,
      updatedAt: archiveTime
    })
  })

  it('deletes session metadata and returns the deleted session for transcript cleanup', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const repository = createMemoryRepository({
      sessions: [
        {
          id: 'agent-session-1',
          projectId: 'project-1',
          title: 'Session 1',
          status: 'idle',
          createdAt: now,
          updatedAt: now,
          transcriptPath: '/agent/sessions/session-1.jsonl'
        }
      ]
    })
    const service = createSessionsService({ repository, now: () => now })

    await expect(service.deleteSession('agent-session-1')).resolves.toMatchObject({
      id: 'agent-session-1',
      transcriptPath: '/agent/sessions/session-1.jsonl'
    })
    await expect(repository.findSessionById('agent-session-1')).resolves.toBeUndefined()
  })

  it('creates workspace agent session metadata with a null project link', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const repository = createMemoryRepository()
    const service = createSessionsService({ repository, now: () => now })

    const session = await service.createWorkspaceAgentSession({
      id: 'workspace-session-1',
      transcriptPath: '/agent/sessions/workspace-session.jsonl'
    })

    expect(session).toEqual({
      id: 'workspace-session-1',
      kind: 'workspace',
      title: 'Workspace Session 1',
      status: 'idle',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    await expect(repository.listWorkspaceSessions()).resolves.toEqual([
      expect.objectContaining({ projectId: null, transcriptPath: '/agent/sessions/workspace-session.jsonl' })
    ])
    await expect(service.listWorkspaceSessions()).resolves.toEqual([session])
  })

  it('creates project agent session metadata with a transcript path link', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const repository = createMemoryRepository()
    const service = createSessionsService({
      repository,
      now: () => now
    })

    const session = await service.createProjectAgentSession({
      id: 'agent-session-1',
      projectId: 'project-1',
      transcriptPath: '/agent/sessions/session.jsonl'
    })

    expect(session).toMatchObject({
      id: 'agent-session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(session).not.toHaveProperty('transcriptPath')
    await expect(repository.listProjectSessions()).resolves.toEqual([
      expect.objectContaining({ transcriptPath: '/agent/sessions/session.jsonl' })
    ])
  })

  it('creates project session metadata with an idle typed status', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const service = createSessionsService({
      repository: createMemoryRepository(),
      now: () => now
    })

    const session = await service.createProjectSession({ projectId: 'project-1' })

    expect(session).toMatchObject({
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    })
    expect(await service.listProjectSessions()).toEqual([session])
  })

  it('numbers new default titles per project and preserves stored running status', async () => {
    const service = createSessionsService({
      repository: createMemoryRepository({
        sessions: [
          {
            id: 'session-1',
            projectId: 'project-1',
            title: 'Existing session',
            status: 'running',
            createdAt: new Date('2026-07-10T00:00:00.000Z'),
            updatedAt: new Date('2026-07-10T00:00:00.000Z')
          }
        ]
      }),
      now: () => new Date('2026-07-10T01:00:00.000Z')
    })

    await expect(service.createProjectSession({ projectId: 'project-1' })).resolves.toMatchObject({
      title: 'Session 2',
      status: 'idle'
    })
    await expect(service.listProjectSessions()).resolves.toEqual([
      expect.objectContaining({ title: 'Existing session', status: 'running' }),
      expect.objectContaining({ title: 'Session 2', status: 'idle' })
    ])
  })

  it('rejects sessions for unknown projects', async () => {
    const service = createSessionsService({ repository: createMemoryRepository({ projectIds: [] }) })

    await expect(service.createProjectSession({ projectId: 'missing-project' })).rejects.toThrow(
      'Project not found'
    )
  })
})
