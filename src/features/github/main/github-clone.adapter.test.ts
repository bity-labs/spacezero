import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createGitHubCloneAdapter, type GitProcessRequest } from './github-clone.adapter'

const roots: string[] = []
const repository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('GitHub clone adapter', () => {
  it('uses token-free arguments and leaves a token-free origin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    const requests: GitProcessRequest[] = []
    const adapter = createGitHubCloneAdapter({
      runGit: async (request) => {
        requests.push(request)
        if (request.args.includes('clone')) {
          const partialDestination = request.args.at(-1)!
          await mkdir(join(partialDestination, '.git'), { recursive: true })
          await writeFile(
            join(partialDestination, '.git', 'config'),
            `[remote "origin"]\n  url = ${repository.cloneUrl}\n`
          )
          return { stdout: '' }
        }
        return { stdout: `${repository.cloneUrl}\n` }
      }
    })

    await adapter.clone({
      repository,
      destination,
      accessToken: 'access-secret',
      signal: new AbortController().signal,
      onProgress: () => undefined
    })

    expect(requests[0].args.join(' ')).not.toContain('access-secret')
    expect(requests[0].args).toContain(repository.cloneUrl)
    expect(requests[0].environment?.GIT_ASKPASS).toBeTruthy()
    expect(requests[0].environment?.GIT_TERMINAL_PROMPT).toBe('0')
    expect(await readFile(join(destination, '.git', 'config'), 'utf8')).not.toContain(
      'access-secret'
    )
  })

  it('removes partial content and sanitizes errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    const adapter = createGitHubCloneAdapter({
      runGit: async (request) => {
        const partialDestination = request.args.at(-1)!
        await mkdir(partialDestination, { recursive: true })
        throw new Error('git failed with access-secret')
      }
    })

    await expect(
      adapter.clone({
        repository,
        destination,
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.cloneFailed')
    await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a clone URL containing credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-test-'))
    roots.push(root)
    const adapter = createGitHubCloneAdapter()

    await expect(
      adapter.clone({
        repository: {
          ...repository,
          cloneUrl: 'https://access-secret@github.com/bity-labs/spacezero.git'
        },
        destination: join(root, 'spacezero'),
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.invalidCloneUrl')
  })

  it('refuses a GitHub clone URL containing an explicit port', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-test-'))
    roots.push(root)
    const adapter = createGitHubCloneAdapter()

    await expect(
      adapter.clone({
        repository: {
          ...repository,
          cloneUrl: 'https://github.com:443/bity-labs/spacezero.git'
        },
        destination: join(root, 'spacezero'),
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.invalidCloneUrl')
  })

  it('refuses to overwrite an existing destination', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    await mkdir(destination, { recursive: true })
    let processRuns = 0
    const adapter = createGitHubCloneAdapter({
      runGit: async () => {
        processRuns += 1
        return { stdout: '' }
      }
    })

    await expect(
      adapter.clone({
        repository,
        destination,
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.cloneDestinationExists')
    expect(processRuns).toBe(0)
  })
})
