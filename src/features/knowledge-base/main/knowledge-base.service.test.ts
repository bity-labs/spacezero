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
    }
  }
}

function createHost(overrides: Partial<KnowledgeBaseHost> = {}): KnowledgeBaseHost {
  return {
    pathExists: vi.fn(async () => false),
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

  it('creates, initializes, commits, and persists the default Knowledge Base', async () => {
    const configurationRepository = createConfigurationRepository()
    const host = createHost()
    const service = createKnowledgeBaseService({
      configurationRepository,
      host,
      rootPath: '/home/builder/SpaceZero/knowledge-base',
      now: () => new Date('2026-07-16T10:00:00.000Z')
    })

    await expect(service.createNew()).resolves.toEqual({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })

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
