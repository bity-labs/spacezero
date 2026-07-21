import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createManagedWorktreeAdapter } from './managed-worktree.adapter'

const execFileAsync = promisify(execFile)
const temporaryPaths: string[] = []

async function runRealGit(request: {
  args: string[]
  environment?: NodeJS.ProcessEnv
  allowFailure?: boolean
}): Promise<{ stdout: string; exitCode: number }> {
  try {
    const { stdout } = await execFileAsync('git', request.args, {
      env: request.environment,
      encoding: 'utf8'
    })
    return { stdout, exitCode: 0 }
  } catch (error) {
    if (request.allowFailure) {
      return {
        stdout:
          typeof error === 'object' && error !== null && 'stdout' in error
            ? String(error.stdout)
            : '',
        exitCode:
          typeof error === 'object' && error !== null && 'code' in error
            ? Number(error.code) || 1
            : 1
      }
    }
    throw error
  }
}

async function createGitRepository(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  await runRealGit({ args: ['init', '-b', 'main', path] })
  await runRealGit({ args: ['-C', path, 'config', 'user.name', 'Space Zero Test'] })
  await runRealGit({ args: ['-C', path, 'config', 'user.email', 'test@spacezero.dev'] })
  await writeFile(join(path, 'README.md'), '# Test\n')
  await runRealGit({ args: ['-C', path, 'add', 'README.md'] })
  await runRealGit({ args: ['-C', path, 'commit', '-m', 'initial'] })
  return (await runRealGit({ args: ['-C', path, 'rev-parse', 'HEAD'] })).stdout.trim()
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('managed worktree adapter', () => {
  it('creates a branch-backed worktree from the base repository HEAD', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const destination = join(root, 'managed', 'session-1')
    const requests: Array<{ args: string[] }> = []
    const runGit = vi.fn(async (request: { args: string[]; allowFailure?: boolean }) => {
      requests.push(request)
      if (request.args.includes('--is-inside-work-tree')) return { stdout: 'true\n', exitCode: 0 }
      if (request.args.includes('--show-toplevel')) {
        return { stdout: '/repos/spacezero\n', exitCode: 0 }
      }
      if (request.args.at(-1) === 'HEAD') return { stdout: 'abc123\n', exitCode: 0 }
      return { stdout: '', exitCode: 0 }
    })
    const adapter = createManagedWorktreeAdapter({ runGit })

    await expect(
      adapter.create({
        projectPath: '/repos/spacezero',
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).resolves.toEqual({ baseRevision: 'abc123' })

    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'worktree',
      'add',
      '--no-track',
      '-b',
      'spacezero/session-session-1',
      '--',
      destination,
      'abc123'
    ])
  })

  it('fetches a Pull Request ref with ephemeral askpass credentials and no token in argv', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const destination = join(root, 'managed', 'session-pr-1')
    const requests: Array<{
      args: string[]
      environment?: NodeJS.ProcessEnv
      allowFailure?: boolean
    }> = []
    const runGit = vi.fn(
      async (request: {
        args: string[]
        environment?: NodeJS.ProcessEnv
        allowFailure?: boolean
      }) => {
        requests.push(request)
        if (request.args.includes('--is-inside-work-tree')) {
          return { stdout: 'true\n', exitCode: 0 }
        }
        if (request.args.includes('--show-toplevel')) {
          return { stdout: '/repos/spacezero\n', exitCode: 0 }
        }
        if (request.args.includes('rev-parse')) {
          return { stdout: `${'d'.repeat(40)}\n`, exitCode: 0 }
        }
        return { stdout: '', exitCode: 0 }
      }
    )
    const adapter = createManagedWorktreeAdapter({ runGit })

    await expect(
      adapter.create({
        projectPath: '/repos/spacezero',
        destination,
        branch: 'spacezero/pull-request-79-session-pr-1',
        startPoint: {
          kind: 'github-ref',
          remoteUrl: 'https://github.com/bity-labs/spacezero.git',
          ref: 'refs/pull/79/head',
          accessToken: 'access-secret'
        }
      })
    ).resolves.toEqual({ baseRevision: 'd'.repeat(40) })

    const fetchRequest = requests.find(
      (request) => request.args.includes('fetch') && request.environment?.SPACEZERO_GITHUB_TOKEN
    )
    expect(fetchRequest?.args.at(-1)).toBe('refs/pull/79/head:refs/spacezero/fetched')
    expect(JSON.stringify(fetchRequest?.args)).not.toContain('access-secret')
    expect(fetchRequest?.environment?.GIT_TERMINAL_PROMPT).toBe('0')
    expect(fetchRequest?.environment?.SPACEZERO_GITHUB_TOKEN).toBe('access-secret')
    const askPassPath = fetchRequest?.environment?.GIT_ASKPASS
    expect(askPassPath).toBeTruthy()
    await expect(access(String(askPassPath))).rejects.toThrow()
  })

  it('isolates token-bearing Git from malicious local Project configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-security-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    await createGitRepository(projectPath)
    await runRealGit({
      args: [
        '-C',
        projectPath,
        'config',
        'url.ext::project-token-probe.insteadOf',
        'https://github.com/'
      ]
    })
    await runRealGit({ args: ['-C', projectPath, 'config', 'protocol.ext.allow', 'always'] })
    const destination = join(root, 'managed', 'session-pr-79')
    const requests: Array<{
      args: string[]
      environment?: NodeJS.ProcessEnv
      allowFailure?: boolean
    }> = []
    let maliciousProjectConfigVisible = false
    const runGit = vi.fn(
      async (request: {
        args: string[]
        environment?: NodeJS.ProcessEnv
        allowFailure?: boolean
      }) => {
        requests.push(request)
        if (request.environment?.SPACEZERO_GITHUB_TOKEN) {
          const projectArgument = request.args.indexOf('-C')
          maliciousProjectConfigVisible = request.args[projectArgument + 1] === projectPath
        }
        if (request.args.includes('--is-inside-work-tree')) {
          return { stdout: 'true\n', exitCode: 0 }
        }
        if (request.args.includes('--show-toplevel')) {
          return { stdout: `${projectPath}\n`, exitCode: 0 }
        }
        if (request.args.includes('rev-parse')) {
          return { stdout: `${'a'.repeat(40)}\n`, exitCode: 0 }
        }
        return { stdout: '', exitCode: 0 }
      }
    )
    const adapter = createManagedWorktreeAdapter({ runGit })

    await adapter.create({
      projectPath,
      destination,
      branch: 'spacezero/pull-request-79-session-pr-79',
      startPoint: {
        kind: 'github-ref',
        remoteUrl: 'https://github.com/bity-labs/spacezero.git',
        ref: 'refs/pull/79/head',
        accessToken: 'access-secret'
      }
    })

    const authenticatedRequests = requests.filter(
      (request) => request.environment?.SPACEZERO_GITHUB_TOKEN
    )
    expect(authenticatedRequests).toHaveLength(1)
    expect(authenticatedRequests[0].args).toEqual(
      expect.arrayContaining(['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always'])
    )
    const projectArgument = authenticatedRequests[0].args.indexOf('-C')
    expect(authenticatedRequests[0].args[projectArgument + 1]).not.toBe(projectPath)
    expect(authenticatedRequests[0].environment?.GIT_CONFIG_NOSYSTEM).toBe('1')
    expect(maliciousProjectConfigVisible).toBe(false)
  })

  it.skipIf(process.platform === 'win32')(
    'prevents a malicious local remote helper from reading the Pull Request fetch credential',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-local-config-test-'))
      temporaryPaths.push(root)
      const projectPath = join(root, 'project')
      await createGitRepository(projectPath)
      const binPath = join(root, 'bin')
      const probePath = join(binPath, 'git-remote-probe')
      const markerPath = join(root, 'token-probe-ran')
      const remoteUrl = 'https://github.com/bity-labs/spacezero.git'
      await mkdir(binPath, { recursive: true })
      await writeFile(
        probePath,
        '#!/bin/sh\nif [ -n "${SPACEZERO_GITHUB_TOKEN:-}" ]; then : > "$PROBE_MARKER"; fi\nexit 1\n',
        { mode: 0o700 }
      )
      await runRealGit({
        args: ['-C', projectPath, 'config', 'url.probe::repository.insteadOf', remoteUrl]
      })
      await runRealGit({
        args: ['-C', projectPath, 'config', 'protocol.probe.allow', 'always']
      })
      const probeEnvironment = {
        ...process.env,
        PATH: `${binPath}${delimiter}${process.env.PATH ?? ''}`,
        GIT_TERMINAL_PROMPT: '0',
        PROBE_MARKER: markerPath,
        SPACEZERO_GITHUB_TOKEN: 'test-canary-not-a-credential'
      }

      await execFileAsync('git', ['-C', projectPath, 'ls-remote', remoteUrl], {
        env: probeEnvironment,
        timeout: 5_000
      }).catch(() => undefined)
      await expect(readFile(markerPath, 'utf8')).resolves.toBe('')
      await rm(markerPath)

      const requests: Array<{ args: string[]; environment?: NodeJS.ProcessEnv }> = []
      const adapter = createManagedWorktreeAdapter({
        runGit: async (request) => {
          requests.push(request)
          const environment = {
            ...(request.environment ?? process.env),
            PATH: probeEnvironment.PATH,
            PROBE_MARKER: markerPath,
            HTTP_PROXY: 'http://127.0.0.1:1',
            HTTPS_PROXY: 'http://127.0.0.1:1',
            ALL_PROXY: 'http://127.0.0.1:1',
            http_proxy: 'http://127.0.0.1:1',
            https_proxy: 'http://127.0.0.1:1',
            all_proxy: 'http://127.0.0.1:1',
            NO_PROXY: '',
            no_proxy: ''
          }
          return runRealGit({ ...request, environment })
        }
      })

      await expect(
        adapter.create({
          projectPath,
          destination: join(root, 'managed', 'session-pr-79'),
          branch: 'spacezero/pull-request-79-session-pr-79',
          startPoint: {
            kind: 'github-ref',
            remoteUrl,
            ref: 'refs/pull/79/head',
            accessToken: 'test-canary-not-a-credential'
          }
        })
      ).rejects.toThrow('session.worktreeCreateFailed')
      expect(
        requests.filter((request) => request.environment?.SPACEZERO_GITHUB_TOKEN)
      ).toHaveLength(1)
      await expect(readFile(markerPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it('resolves concurrent Pull Request fetches from isolated temporary refs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const secondFetchCompleted = deferred()
    const isolatedRevisions = new Map<string, string>()
    const importedRevisions = new Map<string, string>()
    const requests: Array<{ args: string[]; environment?: NodeJS.ProcessEnv }> = []
    const runGit = vi.fn(
      async (request: {
        args: string[]
        environment?: NodeJS.ProcessEnv
        allowFailure?: boolean
      }) => {
        requests.push(request)
        if (request.args.includes('--is-inside-work-tree')) {
          return { stdout: 'true\n', exitCode: 0 }
        }
        if (request.args.includes('--show-toplevel')) {
          return { stdout: '/repos/spacezero\n', exitCode: 0 }
        }
        const workingDirectoryIndex = request.args.indexOf('-C')
        const workingDirectory = request.args[workingDirectoryIndex + 1] ?? ''
        if (request.args.includes('fetch')) {
          const refspec = request.args.at(-1) ?? ''
          const [sourceRef, destinationRef] = refspec.split(':')
          if (request.environment?.SPACEZERO_GITHUB_TOKEN) {
            const revision = sourceRef.includes('/79/') ? 'a'.repeat(40) : 'b'.repeat(40)
            isolatedRevisions.set(workingDirectory, revision)
            if (sourceRef.includes('/79/')) await secondFetchCompleted.promise
            else secondFetchCompleted.resolve()
          } else if (destinationRef) {
            importedRevisions.set(destinationRef, sourceRef)
          }
          return { stdout: '', exitCode: 0 }
        }
        if (request.args.includes('rev-parse')) {
          const ref = request.args.at(-1) ?? ''
          const revision =
            importedRevisions.get(ref) ?? isolatedRevisions.get(workingDirectory) ?? ''
          return { stdout: `${revision}\n`, exitCode: 0 }
        }
        return { stdout: '', exitCode: 0 }
      }
    )
    const adapter = createManagedWorktreeAdapter({ runGit })

    const [first, second] = await Promise.all([
      adapter.create({
        projectPath: '/repos/spacezero',
        destination: join(root, 'managed', 'session-pr-79'),
        branch: 'spacezero/pull-request-79-session-pr-79',
        startPoint: {
          kind: 'github-ref',
          remoteUrl: 'https://github.com/bity-labs/spacezero.git',
          ref: 'refs/pull/79/head',
          accessToken: 'access-secret'
        }
      }),
      adapter.create({
        projectPath: '/repos/spacezero',
        destination: join(root, 'managed', 'session-pr-80'),
        branch: 'spacezero/pull-request-80-session-pr-80',
        startPoint: {
          kind: 'github-ref',
          remoteUrl: 'https://github.com/bity-labs/spacezero.git',
          ref: 'refs/pull/80/head',
          accessToken: 'access-secret'
        }
      })
    ])

    expect(first.baseRevision).toBe('a'.repeat(40))
    expect(second.baseRevision).toBe('b'.repeat(40))
    expect(
      requests
        .filter(
          (request) =>
            request.args.includes('fetch') && !request.environment?.SPACEZERO_GITHUB_TOKEN
        )
        .every((request) => request.args.at(-1)?.includes(':refs/spacezero/fetch/'))
    ).toBe(true)
    expect(requests).not.toContainEqual(
      expect.objectContaining({ args: expect.arrayContaining(['FETCH_HEAD']) })
    )
  })

  it('authenticates a registered managed worktree but rejects the base checkout and an unrelated repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-identity-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    const baseRevision = await createGitRepository(projectPath)
    const destination = join(root, 'managed', 'project-1', 'session-1')
    const branch = 'spacezero/session-session-1'
    const adapter = createManagedWorktreeAdapter()
    await adapter.create({
      projectPath,
      destination,
      branch,
      startPoint: { kind: 'current-head' }
    })

    await expect(
      adapter.validate({ projectPath, destination, branch, baseRevision })
    ).resolves.toBe(true)
    await expect(
      adapter.validate({
        projectPath,
        destination: projectPath,
        branch: 'main',
        baseRevision
      })
    ).resolves.toBe(false)

    const unrelatedPath = join(root, 'unrelated')
    await createGitRepository(unrelatedPath)
    await expect(
      adapter.validate({
        projectPath,
        destination: unrelatedPath,
        branch: 'main',
        baseRevision
      })
    ).resolves.toBe(false)
  })

  it('rejects a repository without a commit before creating a worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-empty-repository-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    await mkdir(projectPath, { recursive: true })
    await runRealGit({ args: ['init', '-b', 'main', projectPath] })
    const destination = join(root, 'managed', 'project-1', 'session-1')

    await expect(
      createManagedWorktreeAdapter().create({
        projectPath,
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).rejects.toThrow('session.projectHasNoCommits')
    await expect(access(destination)).rejects.toThrow()
  })

  it('rejects a repository subdirectory before creating a worktree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-root-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    await createGitRepository(projectPath)
    const projectSubdirectory = join(projectPath, 'packages', 'desktop')
    await mkdir(projectSubdirectory, { recursive: true })
    const destination = join(root, 'managed', 'project-1', 'session-1')

    await expect(
      createManagedWorktreeAdapter().create({
        projectPath: projectSubdirectory,
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).rejects.toThrow('session.projectNotRepositoryRoot')
    await expect(access(destination)).rejects.toThrow()
  })

  it('does not delete a verified worktree directory when Git cleanup fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-remove-test-'))
    temporaryPaths.push(root)
    const projectPath = join(root, 'project')
    const baseRevision = await createGitRepository(projectPath)
    const destination = join(root, 'managed', 'project-1', 'session-1')
    const branch = 'spacezero/session-session-1'
    await createManagedWorktreeAdapter().create({
      projectPath,
      destination,
      branch,
      startPoint: { kind: 'current-head' }
    })
    const requests: string[][] = []
    const adapter = createManagedWorktreeAdapter({
      runGit: async (request) => {
        requests.push(request.args)
        if (request.args.includes('remove')) return { stdout: '', exitCode: 1 }
        return runRealGit(request)
      }
    })

    await expect(
      adapter.remove({ projectPath, destination, branch, baseRevision })
    ).rejects.toThrow('session.worktreeRemoveFailed')
    await expect(access(destination)).resolves.toBeUndefined()
    expect(requests.some((args) => args.includes('branch') && args.includes('-D'))).toBe(false)
  })

  it('attempts reverse-order worktree and branch cleanup when creation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spacezero-worktree-test-'))
    temporaryPaths.push(root)
    const destination = join(root, 'managed', 'session-1')
    const requests: Array<{ args: string[]; allowFailure?: boolean }> = []
    const runGit = vi.fn(async (request: { args: string[]; allowFailure?: boolean }) => {
      requests.push(request)
      if (request.args.includes('--is-inside-work-tree')) return { stdout: 'true\n', exitCode: 0 }
      if (request.args.includes('--show-toplevel')) {
        return { stdout: '/repos/spacezero\n', exitCode: 0 }
      }
      if (request.args.at(-1) === 'HEAD') return { stdout: 'abc123\n', exitCode: 0 }
      if (request.args.includes('add')) throw new Error('session.gitCommandFailed')
      return { stdout: '', exitCode: 1 }
    })
    const adapter = createManagedWorktreeAdapter({ runGit })

    await expect(
      adapter.create({
        projectPath: '/repos/spacezero',
        destination,
        branch: 'spacezero/session-session-1',
        startPoint: { kind: 'current-head' }
      })
    ).rejects.toThrow('session.gitCommandFailed')

    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'worktree',
      'remove',
      '--force',
      '--',
      destination
    ])
    expect(requests.map((request) => request.args)).toContainEqual([
      '-C',
      '/repos/spacezero',
      'branch',
      '-D',
      '--',
      'spacezero/session-session-1'
    ])
  })
})
