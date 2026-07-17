import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createKnowledgeBaseRootProvider } from './knowledge-base-root.provider'

const temporaryDirectories: string[] = []

async function createFixture(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), 'spacezero-kb-root-'))
  temporaryDirectories.push(fixture)
  await mkdir(join(fixture, '.git'))
  return fixture
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('createKnowledgeBaseRootProvider', () => {
  it('returns the stable canonical root for a configured directory', async () => {
    const rootPath = await createFixture()
    const getStatus = vi.fn(async () => ({
      setupState: 'configured' as const,
      rootPath
    }))
    const provider = createKnowledgeBaseRootProvider({ getStatus })

    const canonicalRoot = await realpath(rootPath)
    await expect(provider.getVerifiedRoot()).resolves.toBe(canonicalRoot)
    await expect(provider.getVerifiedRoot()).resolves.toBe(canonicalRoot)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the configured root is replaced by a symbolic link', async () => {
    const fixture = await createFixture()
    const rootPath = join(fixture, 'knowledge-base')
    const outsidePath = join(fixture, 'outside')
    await mkdir(outsidePath)
    await symlink(outsidePath, rootPath)
    const provider = createKnowledgeBaseRootProvider({
      getStatus: async () => ({ setupState: 'configured', rootPath })
    })

    await expect(provider.getVerifiedRoot()).rejects.toThrow(
      'Knowledge Base is unavailable'
    )
  })

  it('fails closed when current status says the repository is unavailable', async () => {
    const provider = createKnowledgeBaseRootProvider({
      getStatus: async () => ({
        setupState: 'unavailable',
        rootPath: '/knowledge-base',
        reason: 'not-git-repository'
      })
    })

    await expect(provider.getVerifiedRoot()).rejects.toThrow(
      'Knowledge Base is unavailable'
    )
  })

  it('fails closed if a verified root is later replaced by a symbolic link', async () => {
    const rootPath = await createFixture()
    const outsidePath = await createFixture()
    const provider = createKnowledgeBaseRootProvider({
      getStatus: async () => ({ setupState: 'configured', rootPath })
    })
    await provider.getVerifiedRoot()

    await rm(rootPath, { recursive: true })
    await symlink(outsidePath, rootPath)

    await expect(provider.getVerifiedRoot()).rejects.toThrow(
      'Knowledge Base is unavailable'
    )
  })
})
