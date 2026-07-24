import { describe, expect, it, vi } from 'vitest'

import {
  createSessionsService,
  type SessionsRepository,
  type StoredSession
} from './sessions.service'

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
    async updateProjectPath() {},
    async hasManagedSessions(projectId) {
      return storedSessions.some(
        (session) =>
          session.projectId === projectId &&
          Boolean(session.worktreePath || session.worktreeBranch || session.worktreeBaseRevision)
      )
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
    },
    async listByProjectIdIncludingArchived(projectId) {
      return storedSessions.filter((session) => session.projectId === projectId)
    },
    async updateMany(sessions) {
      for (const session of sessions) {
        const index = storedSessions.findIndex((item) => item.id === session.id)
        if (index >= 0) storedSessions[index] = session
      }
      return sessions
    },
    async deleteByProjectId(projectId) {
      for (let index = storedSessions.length - 1; index >= 0; index -= 1) {
        if (storedSessions[index].projectId === projectId) storedSessions.splice(index, 1)
      }
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

  it('persists agent model and thinking selections', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
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
    const service = createSessionsService({ repository, now: () => now })

    await service.updateAgentModel('agent-session-1', 'openai', 'gpt-5')
    await service.updateAgentThinkingLevel('agent-session-1', 'high')

    await expect(repository.findSessionById('agent-session-1')).resolves.toMatchObject({
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'high',
      updatedAt: now
    })
  })

  it('excludes system-managed sessions from the ordinary Workspace Session list', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const service = createSessionsService({
      repository: createMemoryRepository({
        sessions: [
          {
            id: 'ordinary-session',
            projectId: null,
            title: 'Workspace Session 1',
            status: 'idle',
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'knowledge-base-session',
            projectId: null,
            managedContext: 'knowledge-base',
            title: 'Knowledge Base Chat',
            status: 'idle',
            createdAt: now,
            updatedAt: now
          }
        ]
      })
    })

    await expect(service.listWorkspaceSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'ordinary-session' })
    ])
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
      expect.objectContaining({
        projectId: null,
        transcriptPath: '/agent/sessions/workspace-session.jsonl'
      })
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
      transcriptPath: '/agent/sessions/session.jsonl',
      worktree: {
        path: '/SpaceZero/worktrees/project-1/agent-session-1',
        branch: 'spacezero/session-agent-session-1',
        baseRevision: 'abc123'
      },
      agentDefinitionSnapshot: {
        id: 'read-only',
        name: 'Read Only',
        body: 'Only inspect files.',
        tools: ['read']
      }
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
      expect.objectContaining({
        transcriptPath: '/agent/sessions/session.jsonl',
        agentDefinitionSnapshot: JSON.stringify({
          id: 'read-only',
          name: 'Read Only',
          body: 'Only inspect files.',
          tools: ['read']
        })
      })
    ])
  })

  it('round-trips managed worktree and durable GitHub source metadata', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const repository = createMemoryRepository()
    const service = createSessionsService({ repository, now: () => now })

    const session = await service.createProjectAgentSession({
      id: 'issue-session-1',
      projectId: 'project-1',
      title: 'Issue #83: GitHub integration',
      worktree: {
        path: '/SpaceZero/worktrees/project-1/issue-session-1',
        branch: 'spacezero/issue-83-issue-session-1',
        baseRevision: 'abc123'
      },
      source: {
        type: 'issue',
        repositoryId: '1000',
        repositoryNodeId: 'R_1000',
        repositoryOwner: 'bity-labs',
        repositoryName: 'spacezero',
        repositoryFullName: 'bity-labs/spacezero',
        number: 83,
        url: 'https://github.com/bity-labs/spacezero/issues/83',
        title: 'GitHub integration'
      }
    })

    expect(session).toMatchObject({
      worktree: {
        path: '/SpaceZero/worktrees/project-1/issue-session-1',
        branch: 'spacezero/issue-83-issue-session-1',
        baseRevision: 'abc123'
      },
      source: {
        type: 'issue',
        repositoryId: '1000',
        repositoryFullName: 'bity-labs/spacezero',
        number: 83
      }
    })
    await expect(service.listProjectSessions()).resolves.toEqual([session])
    await expect(repository.findSessionById('issue-session-1')).resolves.toMatchObject({
      sourceType: 'issue',
      sourceRepositoryId: '1000',
      sourceRepositoryNodeId: 'R_1000',
      sourceNumber: 83,
      worktreePath: '/SpaceZero/worktrees/project-1/issue-session-1'
    })
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

  it('skips and reports project sessions with incomplete durable metadata', async () => {
    const now = new Date('2026-07-10T00:00:00.000Z')
    const onInvalidSessionMetadata = vi.fn()
    const service = createSessionsService({
      repository: createMemoryRepository({
        sessions: [
          {
            id: 'valid-session',
            projectId: 'project-1',
            title: 'Valid session',
            status: 'idle',
            createdAt: now,
            updatedAt: now
          },
          {
            id: 'partial-worktree-session',
            projectId: 'project-1',
            title: 'Partial worktree',
            status: 'idle',
            createdAt: now,
            updatedAt: now,
            worktreePath: '/worktrees/partial'
          },
          {
            id: 'partial-source-session',
            projectId: 'project-1',
            title: 'Partial source',
            status: 'idle',
            createdAt: now,
            updatedAt: now,
            sourceType: 'issue'
          }
        ]
      }),
      onInvalidSessionMetadata
    })

    await expect(service.listProjectSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'valid-session' })
    ])
    expect(onInvalidSessionMetadata.mock.calls).toEqual([
      [
        {
          sessionId: 'partial-worktree-session',
          code: 'session.worktreeMetadataIncomplete'
        }
      ],
      [
        {
          sessionId: 'partial-source-session',
          code: 'session.sourceMetadataIncomplete'
        }
      ]
    ])
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
    const service = createSessionsService({
      repository: createMemoryRepository({ projectIds: [] })
    })

    await expect(service.createProjectSession({ projectId: 'missing-project' })).rejects.toThrow(
      'Project not found'
    )
  })
})
