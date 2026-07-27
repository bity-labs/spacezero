import { describe, expect, it, vi } from 'vitest'

import { withProjectLifecycleLock } from '../../projects/main/project-lifecycle-lock'
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
      closeTerminalsForSession: async (storedSession) => {
        expect(storedSession).toBe(session)
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

    expect(events).toEqual([
      'terminal-start',
      'terminal-finished',
      'utility',
      'worktree',
      'metadata'
    ])
  })

  it('awaits terminal shutdown for each Session before Project deletion continues', async () => {
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

    const deletion = service.deleteProjectSessions('project-1')
    await vi.waitFor(() => expect(events).toEqual(['terminal-start']))
    expect(releaseTerminals).toBeDefined()
    releaseTerminals?.()
    await expect(deletion).resolves.toEqual(['session-1'])

    expect(events).toEqual([
      'terminal-start',
      'terminal-finished',
      'utility',
      'worktree',
      'metadata'
    ])
  })

  it('uses one aggregate terminal decision before cleaning up any Project Session', async () => {
    const sessions = [
      createStoredSession(),
      createStoredSession({
        id: 'session-2',
        title: 'Session 2',
        transcriptPath: '/transcripts/session-2.jsonl',
        worktreePath: '/SpaceZero/worktrees/project-1/session-2',
        worktreeBranch: 'spacezero/session-session-2'
      })
    ]
    const events: string[] = []
    const closeTerminalsForDeletion = vi.fn(async ({ operationKey, sessions: affected }) => {
      expect(operationKey).toBe('delete-project:project-1')
      expect(affected).toEqual(sessions)
      events.push('terminal-confirmation')
    })
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async (sessionId) => sessions.find((session) => session.id === sessionId),
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => sessions,
        deleteById: async (sessionId) => {
          events.push(`metadata:${sessionId}`)
        }
      },
      worktrees: {
        remove: async ({ sessionId }) => {
          events.push(`worktree:${sessionId}`)
        }
      },
      deleteUtilitySession: async ({ sessionId }) => {
        events.push(`utility:${sessionId}`)
      },
      removeTranscript: async () => undefined,
      closeTerminalsForDeletion
    })

    await expect(service.deleteProjectSessions('project-1')).resolves.toEqual([
      'session-1',
      'session-2'
    ])

    expect(closeTerminalsForDeletion).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      'terminal-confirmation',
      'utility:session-1',
      'worktree:session-1',
      'metadata:session-1',
      'utility:session-2',
      'worktree:session-2',
      'metadata:session-2'
    ])
  })

  it('keeps every Project Session intact when aggregate terminal confirmation is cancelled', async () => {
    const sessions = [createStoredSession(), createStoredSession({ id: 'session-2' })]
    const deleteById = vi.fn(async () => undefined)
    const removeWorktree = vi.fn(async () => undefined)
    const deleteUtilitySession = vi.fn(async () => undefined)
    const closeBrowsersForSession = vi.fn()
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async (sessionId) => sessions.find((session) => session.id === sessionId),
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => sessions,
        deleteById
      },
      worktrees: { remove: removeWorktree },
      deleteUtilitySession,
      removeTranscript: async () => undefined,
      closeTerminalsForDeletion: async () => {
        throw new Error('terminal.confirmationCancelled')
      },
      closeBrowsersForSession
    })

    await expect(service.deleteProjectSessions('project-1')).rejects.toThrow(
      'terminal.confirmationCancelled'
    )

    expect(deleteUtilitySession).not.toHaveBeenCalled()
    expect(removeWorktree).not.toHaveBeenCalled()
    expect(deleteById).not.toHaveBeenCalled()
    expect(closeBrowsersForSession).not.toHaveBeenCalled()
  })

  it('coordinates concurrent Project and child Session deletion through the shared lifecycle lock', async () => {
    let storedSession: StoredSession | undefined = createStoredSession()
    const events: string[] = []
    let releaseTerminals: (() => void) | undefined
    const deleteById = vi.fn(async (sessionId: string) => {
      events.push(`metadata:${sessionId}`)
      storedSession = undefined
    })
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => storedSession,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => (storedSession ? [storedSession] : []),
        deleteById
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
      },
      withProjectLifecycleLock
    })

    const projectDeletion = withProjectLifecycleLock('project-1', () =>
      service.deleteProjectSessions('project-1')
    )
    await vi.waitFor(() => expect(events).toEqual(['terminal-start']))
    const childDeletion = service.deleteSession('session-1')
    releaseTerminals?.()
    await Promise.all([projectDeletion, childDeletion])

    expect(events).toEqual([
      'terminal-start',
      'terminal-finished',
      'utility',
      'worktree',
      'metadata:session-1'
    ])
    expect(deleteById).toHaveBeenCalledTimes(1)
  })

  it('propagates terminal shutdown failure before destructive Session cleanup', async () => {
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
      removeTranscript: async () => undefined,
      closeTerminalsForSession: async () => {
        events.push('terminal')
        throw new Error('terminal.killFailed')
      }
    })

    await expect(service.deleteSession('session-1')).rejects.toThrow('terminal.killFailed')
    expect(events).toEqual(['terminal'])
  })

  it('propagates Browser metadata cleanup failure before reporting Session deletion success', async () => {
    const session = createStoredSession()
    const deleteById = vi.fn(async () => undefined)
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById
      },
      worktrees: { remove: vi.fn(async () => undefined) },
      deleteUtilitySession: vi.fn(async () => undefined),
      removeTranscript: vi.fn(async () => undefined),
      closeBrowsersForSession: async () => {
        throw new Error('browser.metadataDeleteFailed')
      }
    })

    await expect(service.deleteSession('session-1')).rejects.toThrow('browser.metadataDeleteFailed')
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('propagates Browser metadata cleanup failure before reporting Project deletion success', async () => {
    const session = createStoredSession()
    const deleteById = vi.fn(async () => undefined)
    const service = createSessionCleanupService({
      repository: {
        findSessionById: async () => session,
        findProjectById: async () => ({ id: 'project-1', path: '/repos/spacezero' }),
        listByProjectIdIncludingArchived: async () => [session],
        deleteById
      },
      worktrees: { remove: vi.fn(async () => undefined) },
      deleteUtilitySession: vi.fn(async () => undefined),
      removeTranscript: vi.fn(async () => undefined),
      closeBrowsersForSession: async () => {
        throw new Error('browser.metadataDeleteFailed')
      }
    })

    await expect(service.deleteProjectSessions('project-1')).rejects.toThrow(
      'browser.metadataDeleteFailed'
    )
    expect(deleteById).not.toHaveBeenCalled()
  })

  it('propagates terminal shutdown failure before destructive Project cleanup', async () => {
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
      removeTranscript: async () => undefined,
      closeTerminalsForSession: async () => {
        events.push('terminal')
        throw new Error('terminal.killFailed')
      }
    })

    await expect(service.deleteProjectSessions('project-1')).rejects.toThrow('terminal.killFailed')
    expect(events).toEqual(['terminal'])
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
        findSessionById: async (sessionId) =>
          [legacySession, managedSession].find((session) => session.id === sessionId),
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
      closeTerminalsForSession: async (session) => {
        deletedSessionIds.push(`terminal:${session.id}`)
      }
    })

    await expect(service.deleteProjectSessions('project-1')).rejects.toThrow(
      'session.worktreeRemoveFailed'
    )
    expect(deletedSessionIds).toEqual([
      'terminal:legacy-session',
      'terminal:session-1',
      'legacy-session'
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
