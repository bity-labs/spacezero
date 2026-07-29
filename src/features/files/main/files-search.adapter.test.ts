import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { searchFiles } from './files-search.adapter'

const execFileAsync = promisify(execFile)

describe('Files search adapter', () => {
  let rootPath: string

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-search-'))
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('returns bounded content matches with context-relative paths and leaves path/name filtering to Files search', async () => {
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
    await expect(searchFiles(rootPath, searchRequest('search'))).resolves.toEqual([])
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

  it('matches git check-ignore semantics for nested, anchored, negated, character-class, and doublestar rules', async () => {
    await execFileAsync('git', ['init'], { cwd: rootPath })
    await mkdir(join(rootPath, 'nested'), { recursive: true })
    await mkdir(join(rootPath, 'anchored'), { recursive: true })
    await mkdir(join(rootPath, 'foo', 'sub'), { recursive: true })
    await writeFile(
      join(rootPath, '.gitignore'),
      '/anchored.txt\n*.log\n!important.log\n[ab].txt\n/foo/**/bar\n'
    )
    await writeFile(join(rootPath, 'nested', '.gitignore'), 'secret.txt\n/anchored.txt\n')
    await writeFile(join(rootPath, 'nested', 'secret.txt'), 'needle')
    await writeFile(join(rootPath, 'nested', 'anchored.txt'), 'needle')
    await writeFile(join(rootPath, 'anchored.txt'), 'needle')
    await writeFile(join(rootPath, 'anchored', 'anchored.txt'), 'needle')
    await writeFile(join(rootPath, 'debug.log'), 'needle')
    await writeFile(join(rootPath, 'important.log'), 'needle')
    await writeFile(join(rootPath, 'a.txt'), 'needle')
    await writeFile(join(rootPath, 'foo', 'bar'), 'needle')
    await writeFile(join(rootPath, 'foo', 'sub', 'bar'), 'needle')

    const gitIgnoredPaths = (
      await execFileAsync(
        'git',
        [
          'check-ignore',
          '-v',
          'nested/secret.txt',
          'a.txt',
          'foo/bar',
          'foo/sub/bar'
        ],
        { cwd: rootPath }
      )
    ).stdout
      .trim()
      .split('\n')
      .map((line) => line.split('\t').at(-1))
    expect(gitIgnoredPaths).toEqual(['nested/secret.txt', 'a.txt', 'foo/bar', 'foo/sub/bar'])

    const defaultPaths = (await searchFiles(rootPath, searchRequest('needle'))).map(
      (result) => result.relativePath
    )
    expect(defaultPaths).toEqual(expect.arrayContaining(['anchored/anchored.txt', 'important.log']))
    expect(defaultPaths).not.toContain('nested/secret.txt')
    expect(defaultPaths).not.toContain('nested/anchored.txt')
    expect(defaultPaths).not.toContain('anchored.txt')
    expect(defaultPaths).not.toContain('debug.log')
    expect(defaultPaths).not.toContain('a.txt')
    expect(defaultPaths).not.toContain('foo/bar')
    expect(defaultPaths).not.toContain('foo/sub/bar')

    await expect(
      searchFiles(rootPath, searchRequest('needle', { includeIgnored: true }))
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relativePath: 'nested/secret.txt' }),
        expect.objectContaining({ relativePath: 'nested/anchored.txt' }),
        expect.objectContaining({ relativePath: 'anchored.txt' }),
        expect.objectContaining({ relativePath: 'debug.log' }),
        expect.objectContaining({ relativePath: 'a.txt' }),
        expect.objectContaining({ relativePath: 'foo/bar' }),
        expect.objectContaining({ relativePath: 'foo/sub/bar' })
      ])
    )
  })

  it('does not start one git check-ignore process per traversed entry', async () => {
    await execFileAsync('git', ['init'], { cwd: rootPath })
    const realGitPath = (await execFileAsync('which', ['git'])).stdout.trim()
    const shimPath = await mkdtemp(join(tmpdir(), 'spacezero-git-shim-'))
    const logPath = join(shimPath, 'git-processes.log')
    const gitShim = join(shimPath, 'git')
    await writeFile(
      gitShim,
      `#!/bin/sh\ncase " $* " in\n  *" check-ignore "*) printf '%s\\n' check-ignore >> "${logPath}" ;;\nesac\nexec "${realGitPath}" "$@"\n`
    )
    await chmod(gitShim, 0o755)
    const previousPath = process.env.PATH
    process.env.PATH = `${shimPath}:${previousPath ?? ''}`

    try {
      for (let index = 0; index < 100; index += 1) {
        await writeFile(join(rootPath, `file-${index}.txt`), 'needle')
      }

      await searchFiles(rootPath, searchRequest('needle', { maxResults: 100 }))

      const checkIgnoreStartupCount = (await readFile(logPath, 'utf8')).trim().split('\n').length
      expect(checkIgnoreStartupCount).toBe(1)
    } finally {
      process.env.PATH = previousPath
      await rm(shimPath, { recursive: true, force: true })
    }
  })

  it('stops before further filesystem work when an in-flight search is aborted', async () => {
    await writeFile(join(rootPath, 'one.txt'), 'needle')
    await writeFile(join(rootPath, 'two.txt'), 'needle')
    const controller = new AbortController()
    controller.abort()

    await expect(
      searchFiles(rootPath, searchRequest('needle'), { signal: controller.signal })
    ).rejects.toThrow('files.searchCanceled')
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
