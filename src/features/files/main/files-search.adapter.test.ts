import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { searchFiles } from './files-search.adapter'

describe('Files search adapter', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-search-'))
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('returns filename and bounded content matches with context-relative paths', async () => {
    await mkdir(join(rootPath, 'docs'))
    await writeFile(join(rootPath, 'docs', 'search-notes.md'), 'hello\nneedle appears here\n')
    await writeFile(join(rootPath, 'other.txt'), 'nothing')

    await expect(searchFiles(rootPath, searchRequest('needle'))).resolves.toEqual([
      {
        kind: 'content',
        relativePath: 'docs/search-notes.md',
        name: 'search-notes.md',
        snippets: [{ line: 2, column: 1, text: 'needle appears here' }]
      }
    ])
    await expect(searchFiles(rootPath, searchRequest('search'))).resolves.toContainEqual({
      kind: 'filename',
      relativePath: 'docs/search-notes.md',
      name: 'search-notes.md'
    })
  })

  it('respects gitignore and generated-directory exclusions unless ignored files are included', async () => {
    await mkdir(join(rootPath, 'node_modules'), { recursive: true })
    await mkdir(join(rootPath, 'private'), { recursive: true })
    await writeFile(join(rootPath, '.gitignore'), 'private/\n*.log\n')
    await writeFile(join(rootPath, 'private', 'hidden.txt'), 'needle')
    await writeFile(join(rootPath, 'debug.log'), 'needle')
    await writeFile(join(rootPath, 'node_modules', 'package.txt'), 'needle')
    await writeFile(join(rootPath, 'visible.txt'), 'needle')

    await expect(searchFiles(rootPath, searchRequest('needle'))).resolves.toEqual([
      expect.objectContaining({ relativePath: 'visible.txt', kind: 'content' })
    ])
    await expect(
      searchFiles(rootPath, searchRequest('needle', { includeIgnored: true }))
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relativePath: 'private/hidden.txt', kind: 'content' }),
        expect.objectContaining({ relativePath: 'debug.log', kind: 'content' }),
        expect.objectContaining({ relativePath: 'node_modules/package.txt', kind: 'content' }),
        expect.objectContaining({ relativePath: 'visible.txt', kind: 'content' })
      ])
    )
  })

  it('hard-excludes git internals, symbolic links, binary files, and oversized content', async () => {
    await mkdir(join(rootPath, '.git'), { recursive: true })
    await writeFile(join(rootPath, '.git', 'secret.txt'), 'needle')
    await writeFile(join(rootPath, 'target.txt'), 'safe target')
    await symlink(join(rootPath, 'target.txt'), join(rootPath, 'linked.txt'))
    await writeFile(join(rootPath, 'binary.bin'), Buffer.from([0, 1, 2, 3]))
    await writeFile(join(rootPath, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 'n'))
    await writeFile(join(rootPath, 'plain.txt'), 'needle')

    await expect(
      searchFiles(rootPath, searchRequest('needle', { includeIgnored: true }))
    ).resolves.toEqual([expect.objectContaining({ relativePath: 'plain.txt', kind: 'content' })])
  })

  it('bounds result count and snippets per file', async () => {
    await writeFile(join(rootPath, 'one.txt'), 'needle\nneedle\nneedle\nneedle\n')
    await writeFile(join(rootPath, 'two.txt'), 'needle')

    const results = await searchFiles(rootPath, searchRequest('needle', { maxResults: 1 }))

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ kind: 'content', relativePath: 'one.txt' })
    if (results[0]?.kind === 'content') expect(results[0].snippets).toHaveLength(3)
  })
})

function searchRequest(
  query: string,
  options: { includeIgnored?: boolean; maxResults?: number } = {}
): { query: string; includeIgnored: boolean; maxResults?: number } {
  return {
    query,
    includeIgnored: options.includeIgnored ?? false,
    ...(options.maxResults === undefined ? {} : { maxResults: options.maxResults })
  }
}
