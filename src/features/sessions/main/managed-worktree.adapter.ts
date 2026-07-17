import { spawn } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ManagedWorktreeAdapter, ManagedWorktreeStartPoint } from './managed-worktree.service'

type RunGit = (request: {
  args: string[]
  environment?: NodeJS.ProcessEnv
  allowFailure?: boolean
}) => Promise<{ stdout: string; exitCode: number }>

export function createManagedWorktreeAdapter({
  runGit = runGitProcess
}: {
  runGit?: RunGit
} = {}): ManagedWorktreeAdapter {
  return {
    async create({ projectPath, destination, branch, startPoint }) {
      if (await pathExists(destination)) throw new Error('session.worktreeDestinationExists')
      await mkdir(dirname(destination), { recursive: true })

      try {
        const repository = await runGit({
          args: ['-C', projectPath, 'rev-parse', '--is-inside-work-tree']
        })
        if (repository.stdout.trim() !== 'true') throw new Error('session.projectNotGitRepository')

        const baseRevision = await resolveBaseRevision(runGit, projectPath, startPoint)
        await runGit({
          args: [
            '-C',
            projectPath,
            'worktree',
            'add',
            '--no-track',
            '-b',
            branch,
            '--',
            destination,
            baseRevision
          ]
        })
        return { baseRevision }
      } catch (error) {
        await cleanupFailedWorktree(runGit, projectPath, destination, branch)
        if (error instanceof Error && error.message.startsWith('session.')) throw error
        throw new Error('session.worktreeCreateFailed', { cause: error })
      }
    },

    async remove({ projectPath, destination, branch }) {
      await runGit({
        args: ['-C', projectPath, 'worktree', 'remove', '--force', '--', destination],
        allowFailure: true
      })
      await runGit({
        args: ['-C', projectPath, 'branch', '-D', '--', branch],
        allowFailure: true
      })
      await rm(destination, { recursive: true, force: true })
    },

    async validate(path) {
      if (!(await pathExists(path))) return false
      const result = await runGit({
        args: ['-C', path, 'rev-parse', '--is-inside-work-tree'],
        allowFailure: true
      })
      return result.exitCode === 0 && result.stdout.trim() === 'true'
    }
  }
}

async function resolveBaseRevision(
  runGit: RunGit,
  projectPath: string,
  startPoint: ManagedWorktreeStartPoint
): Promise<string> {
  if (startPoint.kind === 'github-ref') {
    assertTokenFreeGitHubUrl(startPoint.remoteUrl)
    await withAskPass(startPoint.accessToken, async (environment) => {
      await runGit({
        args: [
          '-c',
          'credential.helper=',
          '-C',
          projectPath,
          'fetch',
          '--force',
          '--no-tags',
          '--',
          startPoint.remoteUrl,
          startPoint.ref
        ],
        environment
      })
    })
    const revision = await runGit({ args: ['-C', projectPath, 'rev-parse', 'FETCH_HEAD'] })
    return revision.stdout.trim()
  }

  const revision = await runGit({ args: ['-C', projectPath, 'rev-parse', 'HEAD'] })
  return revision.stdout.trim()
}

async function cleanupFailedWorktree(
  runGit: RunGit,
  projectPath: string,
  destination: string,
  branch: string
): Promise<void> {
  await runGit({
    args: ['-C', projectPath, 'worktree', 'remove', '--force', '--', destination],
    allowFailure: true
  }).catch(() => undefined)
  await runGit({
    args: ['-C', projectPath, 'branch', '-D', '--', branch],
    allowFailure: true
  }).catch(() => undefined)
  await rm(destination, { recursive: true, force: true }).catch(() => undefined)
}

async function withAskPass<T>(
  accessToken: string,
  operation: (environment: NodeJS.ProcessEnv) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-worktree-askpass-'))
  const path = join(directory, process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh')
  await writeFile(path, createAskPassScript(), { mode: 0o700, flag: 'wx' })
  await chmod(path, 0o700)
  try {
    return await operation({
      ...process.env,
      GIT_ASKPASS: path,
      GIT_TERMINAL_PROMPT: '0',
      SPACEZERO_GITHUB_TOKEN: accessToken
    })
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function createAskPassScript(): string {
  if (process.platform === 'win32') {
    return '@echo off\r\necho %* | findstr /I "Username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %SPACEZERO_GITHUB_TOKEN%)\r\n'
  }
  return '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s\\n" "x-access-token" ;;\n  *) printf "%s\\n" "$SPACEZERO_GITHUB_TOKEN" ;;\nesac\n'
}

function assertTokenFreeGitHubUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'github.com' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error()
    }
  } catch {
    throw new Error('session.invalidGitHubRemote')
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

async function runGitProcess({
  args,
  environment,
  allowFailure = false
}: {
  args: string[]
  environment?: NodeJS.ProcessEnv
  allowFailure?: boolean
}): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      env: environment,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 1024 * 1024) stdout += chunk.toString('utf8')
    })
    child.once('error', () => reject(new Error('session.gitUnavailable')))
    child.once('close', (code) => {
      const exitCode = code ?? 1
      if (exitCode === 0 || allowFailure) resolve({ stdout, exitCode })
      else reject(new Error('session.gitCommandFailed'))
    })
  })
}
