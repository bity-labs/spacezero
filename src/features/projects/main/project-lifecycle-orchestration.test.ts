import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState, CreateAgentSessionRequest } from '../../../shared/agent-protocol'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { createSessionCleanupService } from '../../sessions/main/session-cleanup.service'
import {
  createSessionsService,
  type SessionsRepository,
  type StoredSession
} from '../../sessions/main/sessions.service'
import { archiveProjectLifecycle, deleteProjectLifecycle } from './project-lifecycle-orchestration'

function createRepository(): SessionsRepository {
  const sessions: StoredSession[] = []

  return {
    async listProjectSessions() {
      return sessions.filter((session) => session.projectId !== null)
    },
    async listWorkspaceSessions() {
      return sessions.filter((session) => session.projectId === null)
    },
    async create(session) {
      sessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return sessions.filter((session) => session.projectId === projectId).length
    },
    async countWorkspaceSessions() {
      return sessions.filter((session) => session.projectId === null).length
    },
    async projectExists(projectId) {
      return projectId === 'project-1'
    },
    async findProjectById(projectId) {
      return projectId === 'project-1' ? { id: projectId, path: '/repo' } : undefined
    },
    async updateProjectPath() {},
    async hasManagedSessions(projectId) {
      return sessions.some(
        (session) => session.projectId === projectId && Boolean(session.worktreePath)
      )
    },
    async findSessionById(sessionId) {
      return sessions.find((session) => session.id === sessionId)
    },
    async update(session) {
      const index = sessions.findIndex((candidate) => candidate.id === session.id)
      if (index >= 0) sessions[index] = session
      return session
    },
    async deleteById(sessionId) {
      const index = sessions.findIndex((session) => session.id === sessionId)
      if (index >= 0) sessions.splice(index, 1)
    },
    async listByProjectIdIncludingArchived(projectId) {
      return sessions.filter((session) => session.projectId === projectId)
    },
    async updateMany(nextSessions) {
      for (const session of nextSessions) await this.update(session)
      return nextSessions
    },
    async deleteByProjectId(projectId) {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index].projectId === projectId) sessions.splice(index, 1)
      }
    }
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function createState(request: CreateAgentSessionRequest): AgentSessionState {
  return {
    sessionId: request.sessionId,
    kind: request.kind ?? 'project',
    projectId: request.projectId,
    cwd: request.cwd,
    status: 'idle',
    live: true,
    transcriptPath: `/agent/sessions/${request.sessionId}.jsonl`,
    modelProvider: 'faux',
    modelId: 'faux-1',
    thinkingLevel: 'medium'
  }
}

function startPausedSessionCreation(repository: SessionsRepository, sessionId: string) {
  const started = deferred<CreateAgentSessionRequest>()
  const allowCreation = deferred<void>()
  const creation = createManagedProjectAgentSession(
    { projectId: 'project-1' },
    {
      repository,
      utilityHost: {
        createSession: async (request) => {
          started.resolve(request)
          await allowCreation.promise
          return createState(request)
        },
        deleteSession: async () => undefined
      },
      worktrees: {
        create: async () => ({
          path: `/worktrees/${sessionId}`,
          branch: `spacezero/session-${sessionId}`,
          baseRevision: 'abc123'
        }),
        remove: async () => undefined
      },
      createSessionId: () => sessionId,
      readModelDefaults: async () => ({
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        defaultThinking: 'high'
      })
    }
  )

  return { creation, started: started.promise, allowCreation }
}

describe('Project lifecycle orchestration', () => {
  it('rejects queued Session creation when Project archive wins the lifecycle lock', async () => {
    const archivedAt = new Date('2026-07-20T00:00:00.000Z')
    let projectArchivedAt: Date | null = null
    const baseRepository = createRepository()
    const repository: SessionsRepository = {
      ...baseRepository,
      async findProjectById(projectId) {
        return projectId === 'project-1'
          ? { id: projectId, path: '/repo', archivedAt: projectArchivedAt }
          : undefined
      }
    }
    const archiveStarted = deferred<void>()
    const allowArchiveCompletion = deferred<void>()
    const archive = archiveProjectLifecycle('project-1', {
      sessionsService: createSessionsService({ repository, now: () => archivedAt }),
      projectsService: {
        archiveProject: async () => {
          projectArchivedAt = archivedAt
          archiveStarted.resolve()
          await allowArchiveCompletion.promise
        }
      },
      deleteUtilitySession: async () => undefined
    })
    await archiveStarted.promise

    const createWorktree = vi.fn(async () => ({
      path: '/worktrees/session-archive-first',
      branch: 'spacezero/session-session-archive-first',
      baseRevision: 'abc123'
    }))
    const createUtilitySession = vi.fn(async (request: CreateAgentSessionRequest) =>
      createState(request)
    )
    const creation = createManagedProjectAgentSession(
      { projectId: 'project-1' },
      {
        repository,
        utilityHost: {
          createSession: createUtilitySession,
          deleteSession: async () => undefined
        },
        worktrees: { create: createWorktree, remove: async () => undefined },
        createSessionId: () => 'session-archive-first',
        readModelDefaults: async () => ({
          defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
          defaultThinking: 'high'
        })
      }
    )

    expect(createWorktree).not.toHaveBeenCalled()
    allowArchiveCompletion.resolve()
    await archive

    await expect(creation).rejects.toThrow('Project is archived')
    expect(createWorktree).not.toHaveBeenCalled()
    expect(createUtilitySession).not.toHaveBeenCalled()
    await expect(repository.findSessionById('session-archive-first')).resolves.toBeUndefined()
  })

  it('waits for concurrent Session creation before archiving the Project and its new Session', async () => {
    const repository = createRepository()
    const pausedCreation = startPausedSessionCreation(repository, 'session-archive')
    await pausedCreation.started
    const stoppedSessionIds: string[] = []
    let projectArchived = false

    const archive = archiveProjectLifecycle('project-1', {
      sessionsService: createSessionsService({
        repository,
        now: () => new Date('2026-07-20T00:00:00.000Z')
      }),
      projectsService: {
        archiveProject: async () => {
          projectArchived = true
        }
      },
      deleteUtilitySession: async ({ sessionId }) => {
        stoppedSessionIds.push(sessionId)
      }
    })

    await Promise.resolve()
    expect(projectArchived).toBe(false)

    pausedCreation.allowCreation.resolve()
    await pausedCreation.creation
    await archive

    await expect(repository.findSessionById('session-archive')).resolves.toMatchObject({
      archivedAt: new Date('2026-07-20T00:00:00.000Z')
    })
    expect(projectArchived).toBe(true)
    expect(stoppedSessionIds).toEqual(['session-archive'])
  })

  it('waits for concurrent Session creation before deleting the new Session and Project', async () => {
    const repository = createRepository()
    const pausedCreation = startPausedSessionCreation(repository, 'session-delete')
    await pausedCreation.started
    const removeWorktree = vi.fn(async () => undefined)
    const deleteUtilitySession = vi.fn(async () => undefined)
    let projectDeleted = false

    const deletion = deleteProjectLifecycle('project-1', {
      sessionCleanupService: createSessionCleanupService({
        repository,
        worktrees: { remove: removeWorktree },
        deleteUtilitySession,
        removeTranscript: async () => undefined
      }),
      projectsService: {
        deleteProject: async () => {
          projectDeleted = true
          return {
            id: 'project-1',
            name: 'Space Zero',
            path: '/repo',
            createdAt: new Date('2026-07-18T00:00:00.000Z'),
            updatedAt: new Date('2026-07-18T00:00:00.000Z')
          }
        }
      }
    })

    await Promise.resolve()
    expect(projectDeleted).toBe(false)

    pausedCreation.allowCreation.resolve()
    await pausedCreation.creation
    await deletion

    await expect(repository.findSessionById('session-delete')).resolves.toBeUndefined()
    expect(deleteUtilitySession).toHaveBeenCalledWith({ sessionId: 'session-delete' })
    expect(removeWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', sessionId: 'session-delete' })
    )
    expect(projectDeleted).toBe(true)
  })
})
