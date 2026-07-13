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
      return [...storedSessions].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    },
    async create(session) {
      storedSessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return storedSessions.filter((session) => session.projectId === projectId).length
    },
    async projectExists(projectId) {
      return projects.has(projectId)
    },
    async findProjectById(projectId) {
      if (!projects.has(projectId)) return undefined
      return { id: projectId, path: `/tmp/${projectId}` }
    }
  }
}

describe('createSessionsService', () => {
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
