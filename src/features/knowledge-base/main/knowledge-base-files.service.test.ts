import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'
import { createKnowledgeBaseFilesService } from './knowledge-base-files.service'

const temporaryDirectories: string[] = []

async function createFixture(): Promise<{ rootPath: string; outsidePath: string }> {
  const fixture = await mkdtemp(join(tmpdir(), 'spacezero-kb-files-'))
  temporaryDirectories.push(fixture)
  const rootPath = join(fixture, 'knowledge-base')
  const outsidePath = join(fixture, 'outside.txt')

  await mkdir(join(rootPath, '.git'), { recursive: true })
  await mkdir(join(rootPath, 'docs'), { recursive: true })
  await writeFile(join(rootPath, '.git', 'config'), 'secret git metadata')
  await writeFile(join(rootPath, 'docs', 'note.md'), '# Durable note\n')
  await writeFile(join(rootPath, 'settings.json'), '{"theme":"dark"}\n')
  await writeFile(join(rootPath, 'diagram.png'), Buffer.from([0, 1, 2, 3]))
  await writeFile(outsidePath, 'outside')

  return { rootPath, outsidePath }
}

function configuredRepository(rootPath: string): KnowledgeBaseConfigurationRepository {
  return {
    async get() {
      return { rootPath, configuredAt: new Date(0).toISOString() }
    },
    async save() {}
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('createKnowledgeBaseFilesService', () => {
  it('builds a sorted tree that hides Git internals and includes non-Markdown files', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    const tree = await service.getTree()

    expect(tree.map((item) => item.relativePath)).toEqual([
      'docs',
      'diagram.png',
      'settings.json'
    ])
    expect(tree.find((item) => item.relativePath === 'docs')?.children).toEqual([
      expect.objectContaining({ relativePath: 'docs/note.md', contentKind: 'markdown' })
    ])
    expect(JSON.stringify(tree)).not.toContain('.git')
  })

  it('opens Markdown and text documents through relative paths', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.openDocument({ relativePath: 'docs/note.md' })).resolves.toMatchObject({
      relativePath: 'docs/note.md',
      contentKind: 'markdown',
      content: '# Durable note\n'
    })
    await expect(service.openDocument({ relativePath: 'settings.json' })).resolves.toMatchObject({
      relativePath: 'settings.json',
      contentKind: 'text',
      content: '{"theme":"dark"}\n'
    })
  })

  it('returns file details without text content for unsupported binary files', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.openDocument({ relativePath: 'diagram.png' })).resolves.toMatchObject({
      relativePath: 'diagram.png',
      contentKind: 'binary',
      size: 4,
      content: undefined
    })
  })

  it('rejects traversal, Git internals, absolute paths, and symlinks that can escape the root', async () => {
    const { rootPath, outsidePath } = await createFixture()
    await symlink(outsidePath, join(rootPath, 'outside-link'))
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.openDocument({ relativePath: '../outside.txt' })).rejects.toThrow(
      'Knowledge Base path is outside the configured root.'
    )
    await expect(service.openDocument({ relativePath: '.git/config' })).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
    await expect(service.openDocument({ relativePath: outsidePath })).rejects.toThrow(
      'Knowledge Base paths must be relative.'
    )
    await expect(service.openDocument({ relativePath: 'outside-link' })).rejects.toThrow(
      'Symbolic links cannot be opened from the Knowledge Base.'
    )
  })
})
