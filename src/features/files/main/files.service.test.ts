import { describe, expect, it, vi } from 'vitest'

import { createFilesService } from './files.service'

describe('Files service', () => {
  it('lists the authenticated managed worktree root for a Project Session', async () => {
    const repository = {
      findSessionById: vi.fn(async () => ({
        id: 'session-1',
        projectId: 'project-1',
        worktreePath: '/worktrees/project-1/session-1',
        worktreeBranch: 'spacezero/session-session-1',
        worktreeBaseRevision: 'a'.repeat(40)
      })),
      findProjectById: vi.fn(async () => ({
        id: 'project-1',
        path: '/projects/project-1'
      }))
    }
    const worktrees = { validate: vi.fn(async () => true) }
    const readDirectory = vi.fn(async () => [])
    const service = createFilesService({ repository, worktrees, readDirectory })

    await expect(
      service.listDirectory({ sessionId: 'session-1', relativePath: '' })
    ).resolves.toEqual([])
    expect(worktrees.validate).toHaveBeenCalledWith({
      projectPath: '/projects/project-1',
      projectId: 'project-1',
      sessionId: 'session-1',
      worktree: {
        path: '/worktrees/project-1/session-1',
        branch: 'spacezero/session-session-1',
        baseRevision: 'a'.repeat(40)
      }
    })
    expect(readDirectory).toHaveBeenCalledWith('/worktrees/project-1/session-1', '')
  })

  it('fails instead of falling back when the Project Session has no managed worktree', async () => {
    const readDirectory = vi.fn(async () => [])
    const service = createFilesService({
      repository: {
        findSessionById: async () => ({
          id: 'session-1',
          projectId: 'project-1',
          worktreePath: null,
          worktreeBranch: null,
          worktreeBaseRevision: null
        }),
        findProjectById: async () => ({ id: 'project-1', path: '/projects/project-1' })
      },
      worktrees: { validate: async () => true },
      readDirectory
    })

    await expect(
      service.listDirectory({ sessionId: 'session-1', relativePath: '' })
    ).rejects.toThrow('files.worktreeMissing')
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it('rejects a persisted worktree that does not authenticate for its Project Session', async () => {
    const readDirectory = vi.fn(async () => [])
    const service = createFilesService({
      repository: {
        findSessionById: async () => ({
          id: 'session-1',
          projectId: 'project-1',
          worktreePath: '/projects/project-1',
          worktreeBranch: 'main',
          worktreeBaseRevision: 'a'.repeat(40)
        }),
        findProjectById: async () => ({ id: 'project-1', path: '/projects/project-1' })
      },
      worktrees: { validate: async () => false },
      readDirectory
    })

    await expect(
      service.listDirectory({ sessionId: 'session-1', relativePath: '' })
    ).rejects.toThrow('files.worktreeInvalid')
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it('rejects archived Sessions as inactive Files contexts', async () => {
    const service = createFilesService({
      repository: {
        findSessionById: async () => ({
          id: 'session-1',
          projectId: 'project-1',
          worktreePath: '/worktrees/project-1/session-1',
          worktreeBranch: 'spacezero/session-session-1',
          worktreeBaseRevision: 'a'.repeat(40),
          archivedAt: new Date()
        }),
        findProjectById: async () => ({ id: 'project-1', path: '/projects/project-1' })
      },
      worktrees: { validate: async () => true },
      readDirectory: async () => []
    })

    await expect(
      service.listDirectory({ sessionId: 'session-1', relativePath: '' })
    ).rejects.toThrow('files.projectSessionNotFound')
  })
})
