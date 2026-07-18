import { spawn } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { ManagedWorktreeAdapter, ManagedWorktreeStartPoint } from './managed-worktree.service'

type RunGit = (request: {
  args: string[]
  environment?: NodeJS.ProcessEnv
  allowFailure?: boolean
}) => Promise<{ stdout: string; exitCode: number }>

type ManagedWorktreeValidationRequest = {
  projectPath: string
  destination: string
  branch: string
  baseRevision: string
}

type RegisteredWorktree = {
  path: string
  head?: string
  branch?: string
}

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

        const baseRevision = await resolveBaseRevision(runGit, projectPath, branch, startPoint)
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

    async remove(request) {
      if (!(await validateManagedWorktree(runGit, request))) {
        throw new Error('session.worktreeInvalid')
      }

      const removal = await runGit({
        args: [
          '-C',
          request.projectPath,
          'worktree',
          'remove',
          '--force',
          '--',
          request.destination
        ],
        allowFailure: true
      })
      if (removal.exitCode !== 0) throw new Error('session.worktreeRemoveFailed')

      const branchRemoval = await runGit({
        args: ['-C', request.projectPath, 'branch', '-D', '--', request.branch],
        allowFailure: true
      })
      if (branchRemoval.exitCode !== 0) throw new Error('session.worktreeBranchRemoveFailed')
    },

    async validate(request) {
      return validateManagedWorktree(runGit, request)
    }
  }
}

async function validateManagedWorktree(
  runGit: RunGit,
  request: ManagedWorktreeValidationRequest
): Promise<boolean> {
  if (!/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(request.baseRevision)) return false

  try {
    const projectPath = await realpath(request.projectPath)
    const destination = await realpath(request.destination)
    if (samePath(projectPath, destination)) return false

    const projectRoot = await runGit({
      args: ['-C', request.projectPath, 'rev-parse', '--show-toplevel'],
      allowFailure: true
    })
    if (projectRoot.exitCode !== 0) return false
    if (!samePath(projectPath, await realpath(projectRoot.stdout.trim()))) return false

    const destinationRoot = await runGit({
      args: ['-C', request.destination, 'rev-parse', '--show-toplevel'],
      allowFailure: true
    })
    if (destinationRoot.exitCode !== 0) return false
    if (!samePath(destination, await realpath(destinationRoot.stdout.trim()))) return false

    const projectCommonDirectory = await resolveGitCommonDirectory(runGit, request.projectPath)
    const destinationCommonDirectory = await resolveGitCommonDirectory(runGit, request.destination)
    if (
      !projectCommonDirectory ||
      !destinationCommonDirectory ||
      !samePath(projectCommonDirectory, destinationCommonDirectory)
    ) {
      return false
    }

    const listedWorktrees = await runGit({
      args: ['-C', request.projectPath, 'worktree', 'list', '--porcelain', '-z'],
      allowFailure: true
    })
    if (listedWorktrees.exitCode !== 0) return false
    const registered = await findRegisteredWorktree(listedWorktrees.stdout, destination)
    const expectedBranch = `refs/heads/${request.branch}`
    if (!registered || registered.branch !== expectedBranch || !registered.head) return false

    const destinationBranch = await runGit({
      args: ['-C', request.destination, 'symbolic-ref', '--quiet', 'HEAD'],
      allowFailure: true
    })
    if (destinationBranch.exitCode !== 0 || destinationBranch.stdout.trim() !== expectedBranch) {
      return false
    }

    const destinationHead = await runGit({
      args: ['-C', request.destination, 'rev-parse', 'HEAD'],
      allowFailure: true
    })
    if (destinationHead.exitCode !== 0 || destinationHead.stdout.trim() !== registered.head) {
      return false
    }

    const baseRevision = await runGit({
      args: ['-C', request.projectPath, 'cat-file', '-e', `${request.baseRevision}^{commit}`],
      allowFailure: true
    })
    return baseRevision.exitCode === 0
  } catch {
    return false
  }
}

async function resolveGitCommonDirectory(
  runGit: RunGit,
  path: string
): Promise<string | undefined> {
  const result = await runGit({
    args: ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    allowFailure: true
  })
  if (result.exitCode !== 0 || !result.stdout.trim()) return undefined
  return realpath(result.stdout.trim())
}

async function findRegisteredWorktree(
  output: string,
  destination: string
): Promise<RegisteredWorktree | undefined> {
  for (const worktree of parseRegisteredWorktrees(output)) {
    try {
      if (samePath(await realpath(worktree.path), destination)) return worktree
    } catch {
      // Ignore stale registrations that no longer resolve on disk.
    }
  }
  return undefined
}

function parseRegisteredWorktrees(output: string): RegisteredWorktree[] {
  const worktrees: RegisteredWorktree[] = []
  let current: RegisteredWorktree | undefined

  for (const field of output.split('\0')) {
    if (!field) continue
    const separator = field.indexOf(' ')
    const key = separator === -1 ? field : field.slice(0, separator)
    const value = separator === -1 ? '' : field.slice(separator + 1)
    if (key === 'worktree') {
      if (current) worktrees.push(current)
      current = { path: value }
    } else if (key === 'HEAD' && current) {
      current.head = value
    } else if (key === 'branch' && current) {
      current.branch = value
    }
  }
  if (current) worktrees.push(current)
  return worktrees
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

async function resolveBaseRevision(
  runGit: RunGit,
  projectPath: string,
  branch: string,
  startPoint: ManagedWorktreeStartPoint
): Promise<string> {
  if (startPoint.kind === 'github-ref') {
    assertTokenFreeGitHubUrl(startPoint.remoteUrl)
    const temporaryRef = `refs/spacezero/fetch/${branch}`
    try {
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
            `${startPoint.ref}:${temporaryRef}`
          ],
          environment
        })
      })
      const revision = await runGit({ args: ['-C', projectPath, 'rev-parse', temporaryRef] })
      return revision.stdout.trim()
    } finally {
      await runGit({
        args: ['-C', projectPath, 'update-ref', '-d', temporaryRef],
        allowFailure: true
      }).catch(() => undefined)
    }
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
