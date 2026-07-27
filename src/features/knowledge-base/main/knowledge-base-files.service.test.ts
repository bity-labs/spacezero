import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createKnowledgeBaseOperationCoordinator } from './knowledge-base-operation-coordinator'
import { createKnowledgeBaseRootProvider } from './knowledge-base-root.provider'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'
import { createKnowledgeBaseFilesService as createKnowledgeBaseFilesServiceImplementation } from './knowledge-base-files.service'

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
    async save() {},
    async clear() {}
  }
}

function createKnowledgeBaseFilesService({
  configurationRepository,
  operations
}: {
  configurationRepository: KnowledgeBaseConfigurationRepository
  operations?: Parameters<typeof createKnowledgeBaseFilesServiceImplementation>[0]['operations']
}) {
  return createKnowledgeBaseFilesServiceImplementation({
    rootProvider: {
      async getVerifiedRoot() {
        const configuration = await configurationRepository.get()
        if (!configuration) throw new Error('Knowledge Base is not configured.')
        return configuration.rootPath
      }
    },
    operations
  })
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('createKnowledgeBaseFilesService', () => {
  it('builds a sorted tree that hides Git internals and includes non-Markdown files', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    const tree = await service.getTree()

    expect(tree.map((item) => item.relativePath)).toEqual(['docs', 'diagram.png', 'settings.json'])
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

  it('imports an image into assets/img and returns its document-relative Markdown path', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

    const result = await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName: 'Architecture Diagram.png',
      bytes: image
    })

    expect(result).toEqual({
      assetRelativePath: 'assets/img/architecture-diagram.png',
      markdownPath: '../assets/img/architecture-diagram.png',
      altText: 'Architecture Diagram'
    })
    await expect(
      readFile(join(rootPath, 'assets', 'img', 'architecture-diagram.png'))
    ).resolves.toEqual(Buffer.from(image))
  })

  it('returns Markdown-safe alt text derived from the original file name', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(
      service.importImage({
        documentRelativePath: 'docs/note.md',
        fileName: 'Architecture [draft] {v2} <final>.png',
        bytes: image
      })
    ).resolves.toMatchObject({
      assetRelativePath: 'assets/img/architecture-draft-v2-final.png',
      altText: 'Architecture draft v2 final'
    })
  })

  it('loads an imported image as a renderer-safe preview URL', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    const imported = await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName: 'diagram.png',
      bytes: image
    })

    await expect(
      service.loadImage({
        documentRelativePath: 'docs/note.md',
        markdownPath: imported.markdownPath
      })
    ).resolves.toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from(image).toString('base64')}`
    })
  })

  it('loads previews only from the Knowledge Base assets/img directory', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(
      service.loadImage({
        documentRelativePath: 'docs/note.md',
        markdownPath: '../diagram.png'
      })
    ).rejects.toThrow('Knowledge Base images must be stored under assets/img.')
  })

  it('imports common browser-safe image formats with canonical extensions', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const images = [
      {
        fileName: 'photo.jpeg',
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        expectedPath: 'assets/img/photo.jpg'
      },
      {
        fileName: 'animation.gif',
        bytes: new TextEncoder().encode('GIF89a'),
        expectedPath: 'assets/img/animation.gif'
      },
      {
        fileName: 'preview.webp',
        bytes: new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
        ]),
        expectedPath: 'assets/img/preview.webp'
      }
    ]

    for (const image of images) {
      await expect(
        service.importImage({
          documentRelativePath: 'docs/note.md',
          fileName: image.fileName,
          bytes: image.bytes
        })
      ).resolves.toMatchObject({ assetRelativePath: image.expectedPath })
    }
  })

  it('rejects images larger than the upload limit before writing an asset', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array(10 * 1024 * 1024 + 1)
    image.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(
      service.importImage({
        documentRelativePath: 'docs/note.md',
        fileName: 'too-large.png',
        bytes: image
      })
    ).rejects.toThrow('Knowledge Base image is too large.')
    await expect(access(join(rootPath, 'assets'))).rejects.toThrow()
  })

  it('does not follow a symlinked assets directory outside the Knowledge Base', async () => {
    const { rootPath } = await createFixture()
    const outsideAssets = join(rootPath, '..', 'outside-assets')
    await mkdir(outsideAssets)
    await symlink(outsideAssets, join(rootPath, 'assets'))
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await expect(
      service.importImage({
        documentRelativePath: 'docs/note.md',
        fileName: 'diagram.png',
        bytes: image
      })
    ).rejects.toThrow('Knowledge Base asset directories cannot be symbolic links.')
    await expect(access(join(outsideAssets, 'img'))).rejects.toThrow()
  })

  it('keeps collision-safe names within filesystem limits', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fileName = `${'a'.repeat(251)}.png`

    await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName,
      bytes: image
    })
    const second = await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName,
      bytes: image
    })

    expect(second.assetRelativePath).toBe(`assets/img/${'a'.repeat(80)}-2.png`)
  })

  it('keeps existing assets by choosing a collision-safe image name', async () => {
    const { rootPath } = await createFixture()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName: 'diagram.png',
      bytes: image
    })
    const second = await service.importImage({
      documentRelativePath: 'docs/note.md',
      fileName: 'diagram.png',
      bytes: image
    })

    expect(second.assetRelativePath).toBe('assets/img/diagram-2.png')
    await expect(readFile(join(rootPath, 'assets', 'img', 'diagram.png'))).resolves.toEqual(
      Buffer.from(image)
    )
    await expect(readFile(join(rootPath, 'assets', 'img', 'diagram-2.png'))).resolves.toEqual(
      Buffer.from(image)
    )
  })

  it('saves text with optimistic revision checks', async () => {
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

  it('queues document writes behind an in-flight Knowledge Base operation', async () => {
    const { rootPath } = await createFixture()
    const operations = createKnowledgeBaseOperationCoordinator()
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath),
      operations
    })
    const opened = await service.openDocument({ relativePath: 'docs/note.md' })
    let finishOperation: (() => void) | undefined
    const inFlightOperation = operations.runExclusive(
      () =>
        new Promise<void>((resolve) => {
          finishOperation = resolve
        })
    )

    const save = service.saveDocument({
      relativePath: 'docs/note.md',
      content: '# Serialized update\n',
      expectedRevision: opened.revision
    })
    await Promise.resolve()

    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Durable note\n'
    )

    finishOperation?.()
    await inFlightOperation
    await expect(save).resolves.toMatchObject({ status: 'saved' })
    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Serialized update\n'
    )
  })

  it('does not overwrite external changes when a save revision is stale', async () => {
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

  it('rejects document operations through a parent symlink outside the Knowledge Base', async () => {
    const { rootPath } = await createFixture()
    const outsideDirectory = join(rootPath, '..', 'outside-directory')
    const outsideFile = join(outsideDirectory, 'victim.md')
    await mkdir(outsideDirectory)
    await writeFile(outsideFile, '# Keep me\n')
    await symlink(outsideDirectory, join(rootPath, 'outside-directory-link'))
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(
      service.openDocument({ relativePath: 'outside-directory-link/victim.md' })
    ).rejects.toThrow('Knowledge Base path is outside the configured root.')
    await expect(
      service.saveDocument({
        relativePath: 'outside-directory-link/victim.md',
        content: '# Deleted\n',
        expectedRevision: 'untrusted-revision'
      })
    ).rejects.toThrow('Knowledge Base path is outside the configured root.')
    await expect(readFile(outsideFile, 'utf8')).resolves.toBe('# Keep me\n')
    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Durable note\n'
    )
  })

  it('rejects canonical aliases and parent symlinks into protected Git internals', async () => {
    const { rootPath } = await createFixture()
    await symlink(join(rootPath, '.git'), join(rootPath, 'git-link'))
    const service = createKnowledgeBaseFilesService({
      configurationRepository: configuredRepository(rootPath)
    })

    await expect(service.openDocument({ relativePath: '.GIT/config' })).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
    await expect(service.openDocument({ relativePath: 'git-link/config' })).rejects.toThrow(
      'Knowledge Base Git internals are protected.'
    )
    await expect(
      service.saveDocument({
        relativePath: 'git-link/config',
        content: 'overwritten',
        expectedRevision: 'untrusted-revision'
      })
    ).rejects.toThrow('Knowledge Base Git internals are protected.')
    await expect(readFile(join(rootPath, '.git', 'config'), 'utf8')).resolves.toBe(
      'secret git metadata'
    )
    await expect(readFile(join(rootPath, 'docs', 'note.md'), 'utf8')).resolves.toBe(
      '# Durable note\n'
    )
  })

  it('fails closed when the configured Knowledge Base root is replaced by a symlink', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'spacezero-kb-replaced-root-'))
    temporaryDirectories.push(fixture)
    const rootPath = join(fixture, 'knowledge-base')
    const outsidePath = join(fixture, 'outside')
    await mkdir(outsidePath)
    await writeFile(join(outsidePath, 'secret.txt'), 'outside secret')
    await symlink(outsidePath, rootPath)
    const rootProvider = createKnowledgeBaseRootProvider({
      getStatus: async () => ({ setupState: 'configured', rootPath })
    })
    const service = createKnowledgeBaseFilesServiceImplementation({ rootProvider })

    await expect(service.openDocument({ relativePath: 'secret.txt' })).rejects.toThrow(
      'Knowledge Base is unavailable'
    )
    await expect(readFile(join(outsidePath, 'secret.txt'), 'utf8')).resolves.toBe('outside secret')
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
