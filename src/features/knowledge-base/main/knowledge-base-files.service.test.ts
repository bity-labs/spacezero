import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'
import {
  MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES,
  createKnowledgeBaseFilesService
} from './knowledge-base-files.service'

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
  await writeFile(join(rootPath, 'secret-keyword.png'), Buffer.from([0, 1, 2, 3]))
  await writeFile(
    join(rootPath, 'huge-keyword.txt'),
    Buffer.alloc(MAX_KNOWLEDGE_BASE_TEXT_FILE_BYTES + 1, 'a')
  )
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
      'huge-keyword.txt',
      'secret-keyword.png',
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

  it('autosaves text with optimistic revision checks', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const opened = await service.openDocument({ relativePath: 'docs/note.md' })

    const result = await service.saveDocument({
      relativePath: 'docs/note.md',
      content: '# Updated durable note\n',
      expectedRevision: opened.revision
    })

    expect(result).toMatchObject({
      status: 'saved',
      document: { content: '# Updated durable note\n' }
    })
    expect(result.document.revision).not.toBe(opened.revision)
    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Updated durable note\n'
    )
  })

  it('does not overwrite external changes when an autosave revision is stale', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const opened = await service.openDocument({ relativePath: 'docs/note.md' })
    await writeFile(join(rootPath, 'docs', 'note.md'), '# Changed externally\n')

    const result = await service.saveDocument({
      relativePath: 'docs/note.md',
      content: '# Unsaved editor text\n',
      expectedRevision: opened.revision
    })

    expect(result).toMatchObject({
      status: 'conflict',
      document: { content: '# Changed externally\n' }
    })
    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Changed externally\n'
    )
  })

  it('detects when an open document changes externally', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const opened = await service.openDocument({ relativePath: 'settings.json' })

    await expect(
      service.checkDocument({ relativePath: 'settings.json', revision: opened.revision })
    ).resolves.toEqual({ changed: false })

    await writeFile(join(rootPath, 'settings.json'), '{"theme":"light"}\n')
    await expect(
      service.checkDocument({ relativePath: 'settings.json', revision: opened.revision })
    ).resolves.toMatchObject({
      changed: true,
      document: { content: '{"theme":"light"}\n' }
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

  it('searches filenames and text content with useful snippets on demand', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.search({ query: 'settings' })).resolves.toEqual([
      expect.objectContaining({
        relativePath: 'settings.json',
        matchType: 'filename'
      })
    ])
    await expect(service.search({ query: 'durable' })).resolves.toEqual([
      expect.objectContaining({
        relativePath: 'docs/note.md',
        matchType: 'content',
        snippet: '# Durable note'
      })
    ])
  })

  it('skips Git internals, binary files, oversized files, and creates no search index', async () => {
    const { rootPath } = await createFixture()
    await writeFile(join(rootPath, '.git', 'keyword-note.txt'), 'keyword')
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const entriesBeforeSearch = await readdir(rootPath)

    await expect(service.search({ query: 'keyword' })).resolves.toEqual([])
    expect(await readdir(rootPath)).toEqual(entriesBeforeSearch)
  })

  it('creates files and folders under the configured root', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await service.createItem({ relativePath: 'notes', kind: 'folder' })
    await service.createItem({ relativePath: 'notes/new-note.md', kind: 'file' })

    await expect(readFile(join(rootPath, 'notes', 'new-note.md'), 'utf8')).resolves.toBe('')
  })

  it('renames and moves files and folders without overwriting existing items', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await service.renameItem({ relativePath: 'docs/note.md', newName: 'decision.md' })
    await service.moveItem({
      sourcePath: 'docs/decision.md',
      destinationPath: 'decision.md'
    })

    await expect(readFile(join(rootPath, 'decision.md'), 'utf8')).resolves.toBe('# Durable note\n')
    await expect(
      service.moveItem({ sourcePath: 'decision.md', destinationPath: 'settings.json' })
    ).rejects.toThrow('A Knowledge Base item already exists at the destination.')
  })

  it('permanently deletes files and folders', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await service.deleteItem({ relativePath: 'docs' })

    await expect(access(join(rootPath, 'docs'))).rejects.toThrow()
  })

  it('protects Git internals and rejects traversal for every mutation', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.createItem({ relativePath: '.git/new', kind: 'file' })).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
    await expect(
      service.renameItem({ relativePath: 'docs/note.md', newName: '../outside.md' })
    ).rejects.toThrow('Knowledge Base item names cannot contain path separators.')
    await expect(
      service.moveItem({ sourcePath: 'docs/note.md', destinationPath: '../outside.md' })
    ).rejects.toThrow('Knowledge Base path is outside the configured root.')
    await expect(service.deleteItem({ relativePath: '.git' })).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
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
