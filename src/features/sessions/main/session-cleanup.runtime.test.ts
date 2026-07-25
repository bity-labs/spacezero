import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoredSession } from './sessions.service'

function createStoredSession(id: string): StoredSession {
  return {
    id,
    projectId: 'project-1',
    title: id,
    status: 'idle',
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    transcriptPath: `/transcripts/${id}.jsonl`,
    worktreePath: `/worktrees/${id}`,
    worktreeBranch: `spacezero/session-${id}`,
    worktreeBaseRevision: 'a'.repeat(40),
    managedContext: null
  }
}

async function setupRuntime({
  sessions,
  runWithConfirmation
}: {
  sessions: StoredSession[]
  runWithConfirmation: (request: {
    operationKey: string
    countLiveTerminals: () => number | Promise<number>
    run: () => Promise<unknown>
  }) => Promise<unknown>
}) {
  vi.resetModules()
  const storedSessions = [...sessions]
  const repository = {
    findSessionById: vi.fn(async (sessionId: string) =>
      storedSessions.find((session) => session.id === sessionId)
    ),
    findProjectById: vi.fn(async () => ({ id: 'project-1', path: '/repos/spacezero' })),
    listByProjectIdIncludingArchived: vi.fn(async () => [...storedSessions]),
    deleteById: vi.fn(async (sessionId: string) => {
      const index = storedSessions.findIndex((session) => session.id === sessionId)
      if (index >= 0) storedSessions.splice(index, 1)
    })
  }
  const removeWorktree = vi.fn(async () => undefined)
  const deleteUtilitySession = vi.fn(async () => undefined)
  const closeTerminalContext = vi.fn(async () => undefined)
  const destroySessionContext = vi.fn()

  vi.doMock('./sessions.repository', () => ({ createSessionsRepository: () => repository }))
  vi.doMock('./managed-worktree.runtime', () => ({
    getManagedWorktreeService: () => ({ remove: removeWorktree })
  }))
  vi.doMock('../../agent-workspace/main/agent-utility-process', () => ({
    getAgentUtilityProcessHost: () => ({ deleteSession: deleteUtilitySession })
  }))
  vi.doMock('../../browser/main/browser.ipc', () => ({
    getBrowserService: () => ({
      destroyKnowledgeBaseContext: vi.fn(),
      destroySessionContext
    })
  }))
  vi.doMock('../../terminal/main/terminal.runtime', () => ({
    getTerminalService: () => ({
      countLiveTerminalsForContext: vi.fn(() => 1),
      closeAllForContext: closeTerminalContext
    })
  }))
  vi.doMock('../../terminal/main/terminal-confirmation.service', () => ({
    runWithLiveTerminalConfirmation: vi.fn(runWithConfirmation)
  }))

  const { getSessionCleanupService } = await import('./session-cleanup.runtime')
  const { deleteProjectLifecycle } = await import(
    '../../projects/main/project-lifecycle-orchestration'
  )
  return {
    service: getSessionCleanupService(),
    sameService: getSessionCleanupService(),
    deleteProjectLifecycle,
    repository,
    removeWorktree,
    deleteUtilitySession,
    closeTerminalContext,
    destroySessionContext
  }
}

describe('Session cleanup runtime coordination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('cancels one aggregate multi-Session Project decision before destructive cleanup', async () => {
    const runWithConfirmation = vi.fn(async (request) => {
      expect(request.operationKey).toBe('delete-project:project-1')
      expect(await request.countLiveTerminals()).toBe(2)
      throw new Error('terminal.confirmationCancelled')
    })
    const harness = await setupRuntime({
      sessions: [createStoredSession('session-1'), createStoredSession('session-2')],
      runWithConfirmation
    })
    const deleteProject = vi.fn(async () => ({
      id: 'project-1',
      name: 'Space Zero',
      path: '/repos/spacezero',
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z')
    }))

    await expect(
      harness.deleteProjectLifecycle('project-1', {
        sessionCleanupService: harness.service,
        projectsService: { deleteProject }
      })
    ).rejects.toThrow('terminal.confirmationCancelled')

    expect(harness.sameService).toBe(harness.service)
    expect(runWithConfirmation).toHaveBeenCalledTimes(1)
    expect(harness.closeTerminalContext).not.toHaveBeenCalled()
    expect(harness.deleteUtilitySession).not.toHaveBeenCalled()
    expect(harness.removeWorktree).not.toHaveBeenCalled()
    expect(harness.repository.deleteById).not.toHaveBeenCalled()
    expect(harness.destroySessionContext).not.toHaveBeenCalled()
    expect(deleteProject).not.toHaveBeenCalled()
  })

  it('serializes concurrent Project and child Session deletion through the shared runtime', async () => {
    let releaseTerminalCleanup: (() => void) | undefined
    const runWithConfirmation = vi.fn(async (request) => {
      await new Promise<void>((resolve) => {
        releaseTerminalCleanup = resolve
      })
      return request.run()
    })
    const harness = await setupRuntime({
      sessions: [createStoredSession('session-1')],
      runWithConfirmation
    })
    const deleteProject = vi.fn(async () => ({
      id: 'project-1',
      name: 'Space Zero',
      path: '/repos/spacezero',
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z')
    }))

    const projectDeletion = harness.deleteProjectLifecycle('project-1', {
      sessionCleanupService: harness.service,
      projectsService: { deleteProject }
    })
    await vi.waitFor(() => expect(runWithConfirmation).toHaveBeenCalledTimes(1))
    const childDeletion = harness.sameService.deleteSession('session-1')

    releaseTerminalCleanup?.()
    await Promise.all([projectDeletion, childDeletion])

    expect(runWithConfirmation).toHaveBeenCalledTimes(1)
    expect(harness.closeTerminalContext).toHaveBeenCalledTimes(1)
    expect(harness.deleteUtilitySession).toHaveBeenCalledTimes(1)
    expect(harness.removeWorktree).toHaveBeenCalledTimes(1)
    expect(harness.repository.deleteById).toHaveBeenCalledTimes(1)
    expect(harness.destroySessionContext).toHaveBeenCalledTimes(1)
    expect(deleteProject).toHaveBeenCalledTimes(1)
  })
})
