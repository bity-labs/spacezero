import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { withGitHubGitAuthentication } from '../../../main/lib/github-git-authentication'
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
        await assertProjectRepositoryRoot(runGit, projectPath)
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

async function assertProjectRepositoryRoot(runGit: RunGit, projectPath: string): Promise<void> {
  try {
    const repository = await runGit({
      args: ['-C', projectPath, 'rev-parse', '--is-inside-work-tree']
    })
    if (repository.stdout.trim() !== 'true') throw new Error('session.projectNotGitRepository')

    const root = await runGit({ args: ['-C', projectPath, 'rev-parse', '--show-toplevel'] })
    if (!root.stdout.trim() || !samePath(resolve(projectPath), resolve(root.stdout.trim()))) {
      throw new Error('session.projectNotRepositoryRoot')
    }
    try {
      await runGit({ args: ['-C', projectPath, 'rev-parse', '--verify', 'HEAD^{commit}'] })
    } catch (error) {
      throw new Error('session.projectHasNoCommits', { cause: error })
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('session.project')) throw error
    throw new Error('session.projectNotGitRepository', { cause: error })
  }
}

async function resolveBaseRevision(
  runGit: RunGit,
  projectPath: string,
  branch: string,
  startPoint: ManagedWorktreeStartPoint
): Promise<string> {
  if (startPoint.kind === 'github-ref') {
    assertTokenFreeGitHubUrl(startPoint.remoteUrl)
    return fetchGitHubRevision(runGit, projectPath, branch, startPoint)
  }

  const revision = await runGit({ args: ['-C', projectPath, 'rev-parse', 'HEAD'] })
  return revision.stdout.trim()
}

async function fetchGitHubRevision(
  runGit: RunGit,
  projectPath: string,
  branch: string,
  startPoint: Extract<ManagedWorktreeStartPoint, { kind: 'github-ref' }>
): Promise<string> {
  const temporaryRef = `refs/spacezero/fetch/${branch}`
  const fetchDirectory = await mkdtemp(join(tmpdir(), 'spacezero-github-fetch-'))
  const isolatedRepository = join(fetchDirectory, 'repository.git')

  try {
    return await withGitHubGitAuthentication(startPoint.accessToken, async (authentication) => {
      await runGit({
        args: [
          ...authentication.configArgs,
          'init',
          '--bare',
          `--template=${authentication.templateDirectory}`,
          '--',
          isolatedRepository
        ],
        environment: authentication.isolatedEnvironment
      })
      await runGit({
        args: [
          ...authentication.configArgs,
          '-C',
          isolatedRepository,
          'fetch',
          '--force',
          '--no-tags',
          '--no-write-fetch-head',
          '--',
          startPoint.remoteUrl,
          `${startPoint.ref}:refs/spacezero/fetched`
        ],
        environment: authentication.authenticatedEnvironment
      })
      const isolatedRevision = await runGit({
        args: ['-C', isolatedRepository, 'rev-parse', 'refs/spacezero/fetched'],
        environment: authentication.isolatedEnvironment
      })
      const revision = isolatedRevision.stdout.trim()
      if (!/^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(revision)) {
        throw new Error('session.gitCommandFailed')
      }

      // Import only the fetched object after removing the credential from the child environment.
      await runGit({
        args: [
          '-c',
          'protocol.allow=never',
          '-c',
          'protocol.file.allow=always',
          '-c',
          'protocol.ext.allow=never',
          '-c',
          'fetch.recurseSubmodules=false',
          '-C',
          projectPath,
          'fetch',
          '--force',
          '--no-tags',
          '--no-write-fetch-head',
          '--',
          isolatedRepository,
          `${revision}:${temporaryRef}`
        ]
      })
      const importedRevision = await runGit({
        args: ['-C', projectPath, 'rev-parse', temporaryRef]
      })
      return importedRevision.stdout.trim()
    })
  } finally {
    await runGit({
      args: ['-C', projectPath, 'update-ref', '-d', temporaryRef],
      allowFailure: true
    }).catch(() => undefined)
    await rm(fetchDirectory, { recursive: true, force: true }).catch(() => undefined)
  }
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
