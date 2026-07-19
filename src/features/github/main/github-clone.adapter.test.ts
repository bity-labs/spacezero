import { execFile } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGitHubCloneAdapter, type GitProcessRequest } from './github-clone.adapter'

const execFileAsync = promisify(execFile)
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
  vi.unstubAllEnvs()
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
      managedRoot: join(root, 'projects'),
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

  it('isolates token-bearing clone work from Git config and rejects non-GitHub prompts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-security-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    const maliciousGlobalConfig = join(root, 'malicious.gitconfig')
    await writeFile(
      maliciousGlobalConfig,
      '[url "ext::project-token-probe"]\n  insteadOf = https://github.com/\n'
    )
    vi.stubEnv('GIT_CONFIG_GLOBAL', maliciousGlobalConfig)
    const requests: GitProcessRequest[] = []
    let maliciousGlobalConfigVisible = false
    let rejectedUntrustedPrompt = process.platform === 'win32'
    const adapter = createGitHubCloneAdapter({
      runGit: async (request) => {
        requests.push(request)
        if (request.args.includes('clone')) {
          const cloneIndex = request.args.indexOf('clone')
          try {
            const { stdout } = await execFileAsync(
              'git',
              [...request.args.slice(0, cloneIndex), 'config', '--get-regexp', '^url\\.'],
              { cwd: root, env: request.environment }
            )
            maliciousGlobalConfigVisible = stdout.includes('project-token-probe')
          } catch {
            maliciousGlobalConfigVisible = false
          }
          if (process.platform !== 'win32') {
            try {
              await execFileAsync(
                String(request.environment?.GIT_ASKPASS),
                ["Password for 'https://example.com': "],
                { env: request.environment }
              )
            } catch {
              rejectedUntrustedPrompt = true
            }
          }
          const partialDestination = request.args.at(-1)!
          await mkdir(join(partialDestination, '.git'), { recursive: true })
          await writeFile(
            join(partialDestination, '.git', 'config'),
            `[remote "origin"]\n  url = ${repository.cloneUrl}\n`
          )
          return { stdout: '' }
        }
        if (request.args.includes('get-url')) return { stdout: `${repository.cloneUrl}\n` }
        return { stdout: '' }
      }
    })

    await adapter.clone({
      repository,
      managedRoot: join(root, 'projects'),
      destination,
      accessToken: 'access-secret',
      signal: new AbortController().signal,
      onProgress: () => undefined
    })

    const authenticatedRequest = requests.find((request) => request.args.includes('clone'))
    expect(authenticatedRequest?.args).toEqual(
      expect.arrayContaining([
        '-c',
        'protocol.allow=never',
        '-c',
        'protocol.https.allow=always',
        '--no-checkout'
      ])
    )
    expect(authenticatedRequest?.environment?.GIT_CONFIG_NOSYSTEM).toBe('1')
    expect(authenticatedRequest?.environment?.GIT_CONFIG_GLOBAL).toBeTruthy()
    expect(authenticatedRequest?.environment?.GIT_CONFIG_GLOBAL).not.toBe(maliciousGlobalConfig)
    expect(maliciousGlobalConfigVisible).toBe(false)
    expect(rejectedUntrustedPrompt).toBe(true)
    const checkoutRequest = requests.find((request) => request.args.includes('reset'))
    expect(checkoutRequest?.environment?.SPACEZERO_GITHUB_TOKEN).toBeUndefined()
  })

  it.skipIf(process.platform === 'win32')(
    'prevents a malicious global remote helper from reading the clone credential',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-global-config-test-'))
      roots.push(root)
      const binPath = join(root, 'bin')
      const probePath = join(binPath, 'git-remote-probe')
      const markerPath = join(root, 'token-probe-ran')
      const globalConfigPath = join(root, 'malicious.gitconfig')
      await mkdir(binPath, { recursive: true })
      await writeFile(
        probePath,
        '#!/bin/sh\nif [ -n "${SPACEZERO_GITHUB_TOKEN:-}" ]; then : > "$PROBE_MARKER"; fi\nexit 1\n',
        { mode: 0o700 }
      )
      await writeFile(
        globalConfigPath,
        `[url "probe::repository"]\n  insteadOf = ${repository.cloneUrl}\n[protocol "probe"]\n  allow = always\n`
      )
      const probeEnvironment = {
        ...process.env,
        PATH: `${binPath}${delimiter}${process.env.PATH ?? ''}`,
        GIT_CONFIG_GLOBAL: globalConfigPath,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        PROBE_MARKER: markerPath,
        SPACEZERO_GITHUB_TOKEN: 'test-canary-not-a-credential'
      }

      await execFileAsync('git', ['ls-remote', repository.cloneUrl], {
        env: probeEnvironment,
        timeout: 5_000
      }).catch(() => undefined)
      await expect(readFile(markerPath, 'utf8')).resolves.toBe('')
      await rm(markerPath)

      vi.stubEnv('PATH', probeEnvironment.PATH)
      vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfigPath)
      vi.stubEnv('PROBE_MARKER', markerPath)
      for (const key of [
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'http_proxy',
        'https_proxy',
        'all_proxy'
      ]) {
        vi.stubEnv(key, 'http://127.0.0.1:1')
      }
      vi.stubEnv('NO_PROXY', '')
      vi.stubEnv('no_proxy', '')

      await expect(
        createGitHubCloneAdapter().clone({
          repository,
          managedRoot: join(root, 'projects'),
          destination: join(root, 'projects', 'bity-labs', 'spacezero'),
          accessToken: 'test-canary-not-a-credential',
          signal: new AbortController().signal,
          onProgress: () => undefined
        })
      ).rejects.toThrow('github.cloneFailed')
      await expect(readFile(markerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it('leaves a pre-existing legacy partial directory untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-sentinel-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    const legacyPartialDestination = `${destination}.spacezero-partial`
    const sentinel = join(legacyPartialDestination, 'local-only.txt')
    await mkdir(legacyPartialDestination, { recursive: true })
    await writeFile(sentinel, 'keep me')
    let operationDestination = ''
    const adapter = createGitHubCloneAdapter({
      runGit: async (request) => {
        if (request.args.includes('clone')) {
          operationDestination = request.args.at(-1)!
          await mkdir(join(operationDestination, '.git'), { recursive: true })
          await writeFile(
            join(operationDestination, '.git', 'config'),
            `[remote "origin"]\n  url = ${repository.cloneUrl}\n`
          )
          return { stdout: '' }
        }
        if (request.args.includes('get-url')) return { stdout: `${repository.cloneUrl}\n` }
        return { stdout: '' }
      }
    })

    await adapter.clone({
      repository,
      managedRoot: join(root, 'projects'),
      destination,
      accessToken: 'access-secret',
      signal: new AbortController().signal,
      onProgress: () => undefined
    })

    expect(operationDestination).not.toBe(legacyPartialDestination)
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep me')
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
        managedRoot: join(root, 'projects'),
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
        managedRoot: join(root, 'projects'),
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
        managedRoot: join(root, 'projects'),
        destination: join(root, 'spacezero'),
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.invalidCloneUrl')
  })

  it.skipIf(process.platform === 'win32')(
    'refuses a managed destination whose parent is a symlink outside the managed root',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-containment-test-'))
      roots.push(root)
      const projectsPath = join(root, 'projects')
      const outsidePath = join(root, 'outside')
      await mkdir(projectsPath, { recursive: true })
      await mkdir(outsidePath, { recursive: true })
      await symlink(outsidePath, join(projectsPath, 'bity-labs'), 'dir')
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
          managedRoot: projectsPath,
          destination: join(projectsPath, 'bity-labs', 'spacezero'),
          accessToken: 'access-secret',
          signal: new AbortController().signal,
          onProgress: () => undefined
        })
      ).rejects.toThrow('github.cloneFailed')

      expect(processRuns).toBe(0)
      await expect(access(join(outsidePath, 'spacezero'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.skipIf(process.platform === 'win32')(
    'revalidates the managed parent when it is replaced during clone materialization',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-parent-race-test-'))
      roots.push(root)
      const projectsPath = join(root, 'projects')
      const ownerPath = join(projectsPath, 'bity-labs')
      const outsidePath = join(root, 'outside')
      await mkdir(outsidePath, { recursive: true })
      const adapter = createGitHubCloneAdapter({
        runGit: async (request) => {
          if (request.args.includes('clone')) {
            const partialDestination = request.args.at(-1)!
            await mkdir(join(partialDestination, '.git'), { recursive: true })
            await writeFile(
              join(partialDestination, '.git', 'config'),
              `[remote "origin"]\n  url = ${repository.cloneUrl}\n`
            )
          } else if (request.args.includes('reset')) {
            await rm(ownerPath, { recursive: true, force: true })
            await symlink(outsidePath, ownerPath, 'dir')
          }
          return {
            stdout: request.args.includes('get-url') ? `${repository.cloneUrl}\n` : ''
          }
        }
      })

      await expect(
        adapter.clone({
          repository,
          managedRoot: projectsPath,
          destination: join(ownerPath, 'spacezero'),
          accessToken: 'access-secret',
          signal: new AbortController().signal,
          onProgress: () => undefined
        })
      ).rejects.toThrow('github.cloneFailed')
      await expect(access(join(outsidePath, 'spacezero'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it('does not spawn Git when cancellation already won', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-cancelled-test-'))
    roots.push(root)
    const controller = new AbortController()
    controller.abort()
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
        managedRoot: join(root, 'projects'),
        destination: join(root, 'projects', 'bity-labs', 'spacezero'),
        accessToken: 'access-secret',
        signal: controller.signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.cloneCancelled')
    expect(processRuns).toBe(0)
  })

  it('refuses cleanup for a destination this adapter did not create', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-clone-cleanup-ownership-test-'))
    roots.push(root)
    const destination = join(root, 'projects', 'bity-labs', 'spacezero')
    const sentinel = join(destination, 'local-only.txt')
    await mkdir(destination, { recursive: true })
    await writeFile(sentinel, 'keep me')

    await expect(createGitHubCloneAdapter().removeDestination(destination)).rejects.toThrow(
      'github.cloneDestinationNotOwned'
    )
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep me')
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
        managedRoot: join(root, 'projects'),
        destination,
        accessToken: 'access-secret',
        signal: new AbortController().signal,
        onProgress: () => undefined
      })
    ).rejects.toThrow('github.cloneDestinationExists')
    expect(processRuns).toBe(0)
  })
})
