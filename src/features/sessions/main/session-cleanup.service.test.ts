import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from './sessions.service'
import { createSessionCleanupService } from './session-cleanup.service'

function createStoredSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    title: 'Session 1',
    status: 'idle',
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    transcriptPath: '/transcripts/session-1.jsonl',
    worktreePath: '/SpaceZero/worktrees/project-1/session-1',
    worktreeBranch: 'spacezero/session-session-1',
    worktreeBaseRevision: 'a'.repeat(40),
    ...overrides
  }
}

describe('Session cleanup service', () => {
  it('retains Session metadata when verified worktree cleanup fails', async () => {
    const session = createStoredSession()
    const deleteById = vi.fn(async () => undefined)
    const removeTranscript = vi.fn(async () => undefined)
    const worktrees = {
      remove: vi.fn(async () => {
        throw new Error('session.worktreeRemoveFailed')
      })
    }
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById
      },
      worktrees,
      deleteUtilitySession: async () => undefined,
      removeTranscript
    })

    await expect(service.deleteSession('session-1')).rejects.toThrow('session.worktreeRemoveFailed')
    expect(worktrees.remove).toHaveBeenCalledWith({
      projectPath: '/repos/spacezero',
      projectId: 'project-1',
      sessionId: 'session-1',
      worktree: {
        path: '/SpaceZero/worktrees/project-1/session-1',
        branch: 'spacezero/session-session-1',
        baseRevision: 'a'.repeat(40)
      }
    })
    expect(deleteById).not.toHaveBeenCalled()
    expect(removeTranscript).not.toHaveBeenCalled()
  })

  it('stops owning terminals before destructive Session worktree cleanup', async () => {
    const session = createStoredSession()
    const events: string[] = []
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById: async () => {
          events.push('metadata')
        }
      },
      worktrees: {
        remove: async () => {
          events.push('worktree')
        }
      },
      deleteUtilitySession: async () => {
        events.push('utility')
      },
      removeTranscript: async () => {
        events.push('transcript')
      },
      closeTerminalsForSession: async () => {
        events.push('terminal')
      }
    })

    await service.deleteSession('session-1')

    expect(events).toEqual(['terminal', 'utility', 'worktree', 'metadata', 'transcript'])
  })

  it('awaits terminal shutdown before destructive Session worktree cleanup', async () => {
    const session = createStoredSession()
    const events: string[] = []
    let releaseTerminals: (() => void) | undefined
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById: async () => {
          events.push('metadata')
        }
      },
      worktrees: {
        remove: async () => {
          events.push('worktree')
        }
      },
      deleteUtilitySession: async () => {
        events.push('utility')
      },
      removeTranscript: async () => undefined,
      closeTerminalsForSession: async () => {
        events.push('terminal-start')
        await new Promise<void>((resolve) => {
          releaseTerminals = resolve
        })
        events.push('terminal-finished')
      }
    })

    const deletion = service.deleteSession('session-1')
    await vi.waitFor(() => expect(events).toEqual(['terminal-start']))
    expect(releaseTerminals).toBeDefined()
    releaseTerminals?.()
    await deletion

    expect(events).toEqual(['terminal-start', 'terminal-finished', 'utility', 'worktree', 'metadata'])
  })

  it('awaits terminal shutdown for each Session before Project deletion continues', async () => {
    const session = createStoredSession()
    const events: string[] = []
    let releaseTerminals: (() => void) | undefined
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => undefined,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById: async () => {
          events.push('metadata')
        }
      },
      worktrees: {
        remove: async () => {
          events.push('worktree')
        }
      },
      deleteUtilitySession: async () => {
        events.push('utility')
      },
      removeTranscript: async () => undefined,
      closeTerminalsForSession: async () => {
        events.push('terminal-start')
        await new Promise<void>((resolve) => {
          releaseTerminals = resolve
        })
        events.push('terminal-finished')
      }
    })

    const deletion = service.deleteProjectSessions('project-1')
    await vi.waitFor(() => expect(events).toEqual(['terminal-start']))
    expect(releaseTerminals).toBeDefined()
    releaseTerminals?.()
    await deletion

    expect(events).toEqual(['terminal-start', 'terminal-finished', 'utility', 'worktree', 'metadata'])
  })

  it('deletes durable metadata only after managed resources are removed', async () => {
    const session = createStoredSession()
    const events: string[] = []
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById: async () => {
          events.push('metadata')
        }
      },
      worktrees: {
        remove: async () => {
          events.push('worktree')
        }
      },
      deleteUtilitySession: async () => {
        events.push('utility')
      },
      removeTranscript: async () => {
        events.push('transcript')
      }
    })

    await service.deleteSession('session-1')

    expect(events).toEqual(['utility', 'worktree', 'metadata', 'transcript'])
  })

  it('keeps the failing Session recoverable during Project cleanup', async () => {
    const legacySession = createStoredSession({
      id: 'legacy-session',
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null,
      transcriptPath: null
    })
    const managedSession = createStoredSession()
    const deletedSessionIds: string[] = []
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => undefined,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [legacySession, managedSession],
        deleteById: async (sessionId) => {
          deletedSessionIds.push(sessionId)
        }
      },
      worktrees: {
        remove: async () => {
          throw new Error('session.worktreeRemoveFailed')
        }
      },
      deleteUtilitySession: async () => undefined,
      removeTranscript: async () => undefined,
      closeTerminalsForSession: async (sessionId) => {
        deletedSessionIds.push(`terminal:${sessionId}`)
      }
    })

    await expect(service.deleteProjectSessions('project-1')).rejects.toThrow(
      'session.worktreeRemoveFailed'
    )
    expect(deletedSessionIds).toEqual([
      'terminal:legacy-session',
      'legacy-session',
      'terminal:session-1'
    ])
  })

  it('rejects partial worktree metadata instead of deleting the Session row', async () => {
    const session = createStoredSession({ worktreeBranch: null })
    const deleteById = vi.fn(async () => undefined)
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById
      },
      worktrees: { remove: vi.fn(async () => undefined) },
      deleteUtilitySession: async () => undefined,
      removeTranscript: async () => undefined
    })

    await expect(service.deleteSession('session-1')).rejects.toThrow(
      'session.worktreeMetadataIncomplete'
    )
    expect(deleteById).not.toHaveBeenCalled()
  })
})
