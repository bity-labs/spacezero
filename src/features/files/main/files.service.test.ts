import { describe, expect, it, vi } from 'vitest'

import { createFilesService } from './files.service'

const projectContext = { kind: 'project-session' as const, sessionId: 'session-1' }
const knowledgeBaseContext = { kind: 'knowledge-base', contextKey: 'knowledge-base' } as const
const validSession = {
  id: 'session-1',
  projectId: 'project-1',
  worktreePath: '/worktrees/project-1/session-1',
  worktreeBranch: 'spacezero/session-session-1',
  worktreeBaseRevision: 'a'.repeat(40)
}
const validProject = { id: 'project-1', path: '/projects/project-1' }

function createTestService(overrides: Partial<Parameters<typeof createFilesService>[0]> = {}) {
  return createFilesService({
    repository: {
      findSessionById: async () => validSession,
      findProjectById: async () => validProject
    },
    worktrees: { validate: async () => true },
    knowledgeBaseRootProvider: { getVerifiedRoot: async () => '/knowledge-base' },
    operations: { runExclusive: (operation) => operation() },
    readDirectory: async () => [],
    readTree: async () => [],
    openDocument: async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text',
      size: 7,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'content',
      hasBom: false,
      lineEnding: 'lf'
    }),
    saveDocument: async () => ({
      status: 'saved',
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text',
        size: 7,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: 'updated',
        hasBom: false,
        lineEnding: 'lf'
      }
    }),
    createEntry: async () => undefined,
    moveEntry: async () => undefined,
    trashEntry: async () => undefined,
    revealEntry: async () => undefined,
    search: async () => [],
    ...overrides
  })
}

describe('Files service', () => {
  it('lists the authenticated managed worktree tree for a Project Session', async () => {
    const repository = {
      findSessionById: vi.fn(async () => validSession),
      findProjectById: vi.fn(async () => validProject)
    }
    const worktrees = { validate: vi.fn(async () => true) }
    const readTree = vi.fn(async () => [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' as const }
    ])
    const service = createTestService({ repository, worktrees, readTree })

    await expect(service.listTree({ context: projectContext })).resolves.toEqual([
      { name: 'README.md', relativePath: 'README.md', kind: 'file' }
    ])
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
    expect(readTree).toHaveBeenCalledWith('/worktrees/project-1/session-1')
  })

  it('lists the authenticated managed worktree root for a Project Session', async () => {
    const repository = {
      findSessionById: vi.fn(async () => validSession),
      findProjectById: vi.fn(async () => validProject)
    }
    const worktrees = { validate: vi.fn(async () => true) }
    const readDirectory = vi.fn(async () => [])
    const service = createTestService({ repository, worktrees, readDirectory })

    await expect(
      service.listDirectory({ context: projectContext, relativePath: '' })
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

  it('opens and saves documents through the same authenticated managed worktree', async () => {
    const openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 7,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'content',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const saveDocument = vi.fn(async () => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: 'updated',
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    const service = createTestService({ openDocument, saveDocument })

    await expect(
      service.openDocument({ context: projectContext, relativePath: 'README.md' })
    ).resolves.toMatchObject({ contentKind: 'text', content: 'content' })
    await expect(
      service.saveDocument({
        context: projectContext,
        relativePath: 'README.md',
        content: 'updated',
        expectedRevision: 'revision-1'
      })
    ).resolves.toMatchObject({ status: 'saved' })

    expect(openDocument).toHaveBeenCalledWith('/worktrees/project-1/session-1', 'README.md')
    expect(saveDocument).toHaveBeenCalledWith('/worktrees/project-1/session-1', {
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1'
    })
  })

  it('searches through the same authenticated managed worktree without renderer-selected roots', async () => {
    const search = vi.fn(async () => [
      { kind: 'filename' as const, relativePath: 'README.md', name: 'README.md' }
    ])
    const service = createTestService({ search })

    await expect(
      service.search({
        context: projectContext,
        query: 'readme',
        includeIgnored: false,
        requestId: 'search-1'
      })
    ).resolves.toEqual([{ kind: 'filename', relativePath: 'README.md', name: 'README.md' }])

    expect(search).toHaveBeenCalledWith(
      '/worktrees/project-1/session-1',
      {
        query: 'readme',
        includeIgnored: false
      },
      { signal: expect.any(AbortSignal) }
    )
  })

  it('aborts an in-flight search when superseded in the same context', async () => {
    const signals: AbortSignal[] = []
    let resolveFirst!: (results: []) => void
    const firstSearch = new Promise<[]>((resolve) => {
      resolveFirst = resolve
    })
    const search = vi
      .fn()
      .mockImplementationOnce((_rootPath, _request, options: { signal?: AbortSignal }) => {
        signals.push(options.signal!)
        return firstSearch
      })
      .mockImplementationOnce(async (_rootPath, _request, options: { signal?: AbortSignal }) => {
        signals.push(options.signal!)
        return []
      })
    const service = createTestService({ search })

    const first = service.search({
      context: projectContext,
      query: 'first',
      includeIgnored: false,
      requestId: 'search-1'
    })
    await service.search({
      context: projectContext,
      query: 'second',
      includeIgnored: false,
      requestId: 'search-2'
    })

    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    resolveFirst([])
    await expect(first).resolves.toEqual([])
  })

  it('aborts an in-flight search when explicitly canceled', async () => {
    let signal: AbortSignal | undefined
    const search = vi.fn(
      (_rootPath: string, _request: unknown, _options?: { signal?: AbortSignal }) =>
        new Promise<[]>((_resolve) => undefined)
    )
    const service = createTestService({
      search: (rootPath, request, options) => {
        signal = options?.signal
        return search(rootPath, request, options)
      }
    })

    void service.search({
      context: projectContext,
      query: 'needle',
      includeIgnored: false,
      requestId: 'search-1'
    })
    await vi.waitFor(() => expect(signal).toBeDefined())
    await service.cancelSearch({ context: projectContext, requestId: 'search-1' })

    expect(signal?.aborted).toBe(true)
  })

  it('resolves Knowledge Base Files from the verified Knowledge Base repository', async () => {
    const knowledgeBaseRootProvider = { getVerifiedRoot: vi.fn(async () => '/verified/kb') }
    const readDirectory = vi.fn(async () => [])
    const openDocument = vi.fn(async () => ({
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 7,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'content',
      hasBom: false,
      lineEnding: 'lf' as const
    }))
    const service = createTestService({ knowledgeBaseRootProvider, readDirectory, openDocument })

    await expect(
      service.listDirectory({ context: knowledgeBaseContext, relativePath: '' })
    ).resolves.toEqual([])
    await expect(
      service.openDocument({ context: knowledgeBaseContext, relativePath: 'README.md' })
    ).resolves.toMatchObject({ contentKind: 'text', content: 'content' })

    expect(readDirectory).toHaveBeenCalledWith('/verified/kb', '')
    expect(openDocument).toHaveBeenCalledWith('/verified/kb', 'README.md')
  })

  it('reveals entries from the same authenticated Project Session and Knowledge Base roots', async () => {
    const revealEntry = vi.fn(async () => undefined)
    const knowledgeBaseRootProvider = { getVerifiedRoot: vi.fn(async () => '/verified/kb') }
    const service = createTestService({ revealEntry, knowledgeBaseRootProvider })

    await service.revealInSystemFileManager({
      context: projectContext,
      relativePath: 'binary.dat'
    })
    await service.revealInSystemFileManager({
      context: knowledgeBaseContext,
      relativePath: 'assets/image.png'
    })

    expect(revealEntry).toHaveBeenCalledWith('/worktrees/project-1/session-1', 'binary.dat')
    expect(revealEntry).toHaveBeenCalledWith('/verified/kb', 'assets/image.png')
  })

  it('forwards overwrite and recreate acknowledgements through both public rooted services', async () => {
    const saveDocument = vi.fn(async () => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: 'updated',
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    const service = createTestService({ saveDocument })

    await service.saveDocument({
      context: projectContext,
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1',
      conflictResolution: { kind: 'overwrite', acknowledgedRevision: 'disk-revision' }
    })
    await service.saveDocument({
      context: knowledgeBaseContext,
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1',
      conflictResolution: { kind: 'recreate', acknowledgedMissingRevision: 'missing-revision' }
    })

    expect(saveDocument).toHaveBeenNthCalledWith(1, '/worktrees/project-1/session-1', {
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1',
      conflictResolution: { kind: 'overwrite', acknowledgedRevision: 'disk-revision' }
    })
    expect(saveDocument).toHaveBeenNthCalledWith(2, '/knowledge-base', {
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1',
      conflictResolution: { kind: 'recreate', acknowledgedMissingRevision: 'missing-revision' }
    })
  })

  it('coordinates Knowledge Base writes through the existing Knowledge Base operation lock', async () => {
    const operations = { runExclusive: vi.fn(async (operation) => operation()) }
    const saveDocument = vi.fn(async () => ({
      status: 'saved' as const,
      document: {
        name: 'README.md',
        relativePath: 'README.md',
        contentKind: 'text' as const,
        size: 7,
        modifiedAt: new Date(1).toISOString(),
        revision: 'revision-2',
        content: 'updated',
        hasBom: false,
        lineEnding: 'lf' as const
      }
    }))
    const service = createTestService({ operations, saveDocument })

    await expect(
      service.saveDocument({
        context: knowledgeBaseContext,
        relativePath: 'README.md',
        content: 'updated',
        expectedRevision: 'revision-1'
      })
    ).resolves.toMatchObject({ status: 'saved' })

    expect(operations.runExclusive).toHaveBeenCalledTimes(1)
    expect(saveDocument).toHaveBeenCalledWith('/knowledge-base', {
      relativePath: 'README.md',
      content: 'updated',
      expectedRevision: 'revision-1'
    })
  })

  it('creates, moves, and trashes entries through both authenticated roots', async () => {
    const createEntry = vi.fn(async () => undefined)
    const moveEntry = vi.fn(async () => undefined)
    const trashEntry = vi.fn(async () => undefined)
    const knowledgeBaseRootProvider = { getVerifiedRoot: vi.fn(async () => '/verified/kb') }
    const service = createTestService({
      createEntry,
      moveEntry,
      trashEntry,
      knowledgeBaseRootProvider
    })

    await service.createEntry({ context: projectContext, relativePath: 'src/new.ts', kind: 'file' })
    await service.moveEntry({
      context: projectContext,
      sourcePath: 'src/new.ts',
      destinationPath: 'src/main.ts'
    })
    await service.trashEntry({ context: projectContext, relativePath: 'src/main.ts' })
    await service.createEntry({
      context: knowledgeBaseContext,
      relativePath: 'notes',
      kind: 'folder'
    })

    expect(createEntry).toHaveBeenCalledWith('/worktrees/project-1/session-1', {
      relativePath: 'src/new.ts',
      kind: 'file'
    })
    expect(moveEntry).toHaveBeenCalledWith('/worktrees/project-1/session-1', {
      sourcePath: 'src/new.ts',
      destinationPath: 'src/main.ts'
    })
    expect(trashEntry).toHaveBeenCalledWith('/worktrees/project-1/session-1', {
      relativePath: 'src/main.ts'
    })
    expect(createEntry).toHaveBeenCalledWith('/verified/kb', {
      relativePath: 'notes',
      kind: 'folder'
    })
  })

  it('fails instead of falling back when the Project Session has no managed worktree', async () => {
    const readDirectory = vi.fn(async () => [])
    const service = createTestService({
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
      readDirectory
    })

    await expect(
      service.listDirectory({ context: projectContext, relativePath: '' })
    ).rejects.toThrow('files.worktreeMissing')
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it('rejects a persisted worktree that does not authenticate for its Project Session', async () => {
    const readDirectory = vi.fn(async () => [])
    const service = createTestService({
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
      service.listDirectory({ context: projectContext, relativePath: '' })
    ).rejects.toThrow('files.worktreeInvalid')
    expect(readDirectory).not.toHaveBeenCalled()
  })

  it('rejects archived Sessions as inactive Files contexts', async () => {
    const service = createTestService({
      repository: {
        findSessionById: async () => ({ ...validSession, archivedAt: new Date() }),
        findProjectById: async () => ({ id: 'project-1', path: '/projects/project-1' })
      }
    })

    await expect(
      service.listDirectory({ context: projectContext, relativePath: '' })
    ).rejects.toThrow('files.projectSessionNotFound')
  })
})
