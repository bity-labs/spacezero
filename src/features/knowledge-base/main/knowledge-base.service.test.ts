import { describe, expect, it, vi } from 'vitest'

import {
  KNOWLEDGE_BASE_AGENTS_INSTRUCTIONS,
  createKnowledgeBaseService,
  type KnowledgeBaseConfigurationRepository,
  type KnowledgeBaseHost
} from './knowledge-base.service'

function createConfigurationRepository(): KnowledgeBaseConfigurationRepository & {
  value?: { rootPath: string; configuredAt: string }
} {
  return {
    value: undefined,
    async get() {
      return this.value
    },
    async save(configuration) {
      this.value = configuration
    },
    async clear() {
      this.value = undefined
    }
  }
}

function createHost(overrides: Partial<KnowledgeBaseHost> = {}): KnowledgeBaseHost {
  return {
    pathExists: vi.fn(async () => false),
    resolveDirectory: vi.fn(async (path: string) => path),
    createDirectory: vi.fn(async () => undefined),
    ensureParentDirectory: vi.fn(async () => undefined),
    removeDirectory: vi.fn(async () => undefined),
    writeTextFile: vi.fn(async () => undefined),
    runGit: vi.fn(async () => ({ stdout: '', stderr: '' })),
    ...overrides
  }
}

describe('createKnowledgeBaseService', () => {
  it('documents the fixed image asset convention for Knowledge Base agents', () => {
    expect(KNOWLEDGE_BASE_AGENTS_INSTRUCTIONS).toContain('assets/img')
  })

  it('reports an unconfigured Knowledge Base before setup', async () => {
    const service = createKnowledgeBaseService({
      configurationRepository: createConfigurationRepository(),
      host: createHost(),
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      now: () => new Date('2026-07-16T10:00:00.000Z')
    })

    await expect(service.getStatus()).resolves.toEqual({ setupState: 'unconfigured' })
  })

  it('reports a persisted Knowledge Base as unavailable when its repository is missing', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const host = createHost({ pathExists: vi.fn(async () => false) })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.getStatus()).resolves.toEqual({
      setupState: 'unavailable',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      reason: 'missing'
    })
    expect(host.runGit).not.toHaveBeenCalled()
  })

  it('reports a persisted folder as unavailable when it is no longer a Git repository', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const host = createHost({
      pathExists: vi.fn(async () => true),
      runGit: vi.fn(async () => {
        throw new Error('not a git repository')
      })
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.getStatus()).resolves.toEqual({
      setupState: 'unavailable',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      reason: 'not-git-repository'
    })
  })

  it('reconnects when the persisted Knowledge Base repository is restored', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const host = createHost({
      pathExists: vi.fn(async () => true),
      runGit: vi.fn(async () => ({
        stdout: '/home/builder/SpaceZero/knowledge-base\n',
        stderr: ''
      }))
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.getStatus()).resolves.toEqual({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    expect(host.runGit).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base', [
      'rev-parse',
      '--show-toplevel'
    ])
  })

  it('accepts a configured repository through canonical parent-path aliases', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/var/folders/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const host = createHost({
      pathExists: vi.fn(async () => true),
      resolveDirectory: vi.fn(async () => '/private/var/folders/knowledge-base'),
      runGit: vi.fn(async () => ({
        stdout: '/private/var/folders/knowledge-base\n',
        stderr: ''
      }))
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/var/folders/knowledge-base'
    })

    await expect(service.getStatus()).resolves.toEqual({
      setupState: 'configured',
      rootPath: '/var/folders/knowledge-base'
    })
    expect(host.runGit).toHaveBeenCalledWith(
      '/private/var/folders/knowledge-base',
      ['rev-parse', '--show-toplevel']
    )
  })

  it('does not treat a plain folder inside another repository as the Knowledge Base repository', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const service = createKnowledgeBaseService({
      configurationRepository,
      host: createHost({
        pathExists: vi.fn(async () => true),
        runGit: vi.fn(async () => ({
          stdout: '/home/builder/SpaceZero\n',
          stderr: ''
        }))
      }),
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.getStatus()).resolves.toEqual({
      setupState: 'unavailable',
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      reason: 'not-git-repository'
    })
  })

  it('resets unavailable configuration so setup can run again', async () => {
    const configurationRepository = createConfigurationRepository()
    configurationRepository.value = {
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: new Date(0).toISOString()
    }
    const clearSyncState = vi.fn(async () => undefined)
    const service = createKnowledgeBaseService({
      configurationRepository,
      host: createHost(),
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      clearSyncState
    })

    await expect(service.reset()).resolves.toEqual({ setupState: 'unconfigured' })
    expect(clearSyncState).toHaveBeenCalledTimes(1)
    expect(configurationRepository.value).toBeUndefined()
  })

  it('creates, initializes, commits, and persists the default Knowledge Base', async () => {
    const configurationRepository = createConfigurationRepository()
    const host = createHost()
    const clearSyncState = vi.fn(async () => undefined)
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      clearSyncState,
      now: () => new Date('2026-07-16T10:00:00.000Z')
    })

    await expect(service.createNew()).resolves.toEqual({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    expect(clearSyncState).toHaveBeenCalledTimes(1)
    expect(host.createDirectory).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base')
    expect(host.writeTextFile).toHaveBeenCalledWith(
      '/home/builder/SpaceZero/knowledge-base/AGENTS.md',
      KNOWLEDGE_BASE_AGENTS_INSTRUCTIONS
    )
    expect(host.runGit).toHaveBeenNthCalledWith(1, '/home/builder/SpaceZero/knowledge-base', [
      'init',
      '-b',
      'main'
    ])
    expect(host.runGit).toHaveBeenNthCalledWith(2, '/home/builder/SpaceZero/knowledge-base', [
      'add',
      'AGENTS.md'
    ])
    expect(host.runGit).toHaveBeenNthCalledWith(3, '/home/builder/SpaceZero/knowledge-base', [
      'commit',
      '-m',
      'Initialize Knowledge Base'
    ])
    expect(configurationRepository.value).toEqual({
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: '2026-07-16T10:00:00.000Z'
    })
  })

  it('blocks setup without modifying an existing destination', async () => {
    const configurationRepository = createConfigurationRepository()
    const host = createHost({ pathExists: vi.fn(async () => true) })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.createNew()).rejects.toThrow(
      'Knowledge Base folder already exists. Move or remove it before setup.'
    )
    expect(host.createDirectory).not.toHaveBeenCalled()
    expect(host.runGit).not.toHaveBeenCalled()
    expect(configurationRepository.value).toBeUndefined()
  })

  it('clones an existing repository without modifying its contents and persists after success', async () => {
    const configurationRepository = createConfigurationRepository()
    const host = createHost()
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      now: () => new Date('2026-07-16T11:00:00.000Z')
    })

    await expect(service.cloneFromGit({ gitUrl: 'git@example.com:builder/notes.git' })).resolves.toEqual({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    expect(host.ensureParentDirectory).toHaveBeenCalledWith(
      '/home/builder/SpaceZero/knowledge-base'
    )
    expect(host.runGit).toHaveBeenCalledWith('/home/builder/SpaceZero', [
      'clone',
      'git@example.com:builder/notes.git',
      '/home/builder/SpaceZero/knowledge-base'
    ])
    expect(host.writeTextFile).not.toHaveBeenCalled()
    expect(configurationRepository.value).toEqual({
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      configuredAt: '2026-07-16T11:00:00.000Z'
    })
  })

  it('blocks clone when the destination exists', async () => {
    const host = createHost({ pathExists: vi.fn(async () => true) })
    const service = createKnowledgeBaseService({
      configurationRepository: createConfigurationRepository(),
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(
      service.cloneFromGit({ gitUrl: 'https://example.com/notes.git' })
    ).rejects.toThrow('Knowledge Base folder already exists. Move or remove it before setup.')
    expect(host.runGit).not.toHaveBeenCalled()
  })

  it('redacts credentials from clone failures returned across IPC', async () => {
    const configurationRepository = createConfigurationRepository()
    const credentialUrl = 'https://builder:secret-token@example.com/notes.git'
    let destinationExists = false
    const host = createHost({
      pathExists: vi.fn(async () => destinationExists),
      runGit: vi.fn(async () => {
        destinationExists = true
        throw new Error(`fatal: unable to access '${credentialUrl}': authentication failed`)
      })
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.cloneFromGit({ gitUrl: credentialUrl })).rejects.toThrow(
      "fatal: unable to access 'https://example.com/notes.git': authentication failed"
    )
    expect(host.removeDirectory).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base')
    expect(configurationRepository.value).toBeUndefined()
  })

  it('surfaces clone failures, removes the failed destination, and does not persist', async () => {
    const configurationRepository = createConfigurationRepository()
    let destinationExists = false
    const host = createHost({
      pathExists: vi.fn(async () => destinationExists),
      runGit: vi.fn(async () => {
        destinationExists = true
        throw new Error('Permission denied (publickey)')
      })
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(
      service.cloneFromGit({ gitUrl: 'git@example.com:builder/notes.git' })
    ).rejects.toThrow('Permission denied (publickey)')
    expect(host.removeDirectory).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base')
    expect(configurationRepository.value).toBeUndefined()
  })

  it('removes a partially-created destination and does not persist when setup fails', async () => {
    const configurationRepository = createConfigurationRepository()
    const host = createHost({
      runGit: vi.fn(async () => {
        throw new Error('git commit failed')
      })
    })
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

    await expect(service.createNew()).rejects.toThrow('git commit failed')
    expect(host.removeDirectory).toHaveBeenCalledWith('/home/builder/SpaceZero/knowledge-base')
    expect(configurationRepository.value).toBeUndefined()
  })
})
