import { execFile } from 'node:child_process'
import { constants, watch } from 'node:fs'
import type { FSWatcher, Stats } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import type { GitChangeFilter, GitFileDiff, GitReviewState, GitUpstreamState } from '../shared'
import type { ManagedWorktreeService } from '../../sessions/main/managed-worktree.service'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'

const execFileAsync = promisify(execFile)
const MAX_DIFF_BYTES = 256 * 1024
const MAX_GIT_OUTPUT_BYTES = MAX_DIFF_BYTES * 2
const MAX_ERROR_MESSAGE_BYTES = 4 * 1024
const MAX_UNTRACKED_BYTES = 128 * 1024

export type GitService = ReturnType<typeof createGitService>

type GitRunner = (request: { cwd: string; args: string[]; allowFailure?: boolean }) => Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>

type UntrackedFileSystem = {
  lstat: (path: string) => Promise<Stats>
  open: (path: string, flags: number) => ReturnType<typeof open>
  realpath: (path: string) => Promise<string>
}

type PathFlavor = Pick<typeof path, 'isAbsolute' | 'join' | 'relative'>

const defaultUntrackedFileSystem: UntrackedFileSystem = { lstat, open, realpath }

export function createGitService({
  sessionsRepository,
  managedWorktreeService,
  runGit = runGitCli,
  fileSystem = defaultUntrackedFileSystem,
  pathFlavor = path
}: {
  sessionsRepository: SessionsRepository
  managedWorktreeService: ManagedWorktreeService
  runGit?: GitRunner
  fileSystem?: UntrackedFileSystem
  pathFlavor?: PathFlavor
}) {
  async function getProjectSessionReview(
    sessionId: string,
    filter: GitChangeFilter = 'uncommitted'
  ): Promise<GitReviewState> {
    const session = await sessionsRepository.findSessionById(sessionId)
    if (!session || !session.projectId) {
      return { status: 'missing-worktree', message: 'Project Session not found.' }
    }

    const worktree = getSessionWorktree(session)
    if (!worktree) {
      return { status: 'missing-worktree', message: 'This Project Session has no managed worktree.' }
    }

    const project = await sessionsRepository.findProjectById(session.projectId)
    if (!project || project.archivedAt) {
      return { status: 'inaccessible', message: 'The Project for this Session is unavailable.' }
    }

    const valid = await managedWorktreeService.validate({
      projectPath: project.path,
      projectId: session.projectId,
      sessionId: session.id,
      worktree
    })
    if (!valid) {
      return { status: 'inaccessible', message: 'The managed worktree could not be authenticated.' }
    }

    try {
      const branch = await getBranch(worktree.path, runGit)
      const upstream = await getUpstream(worktree.path, runGit)
      const statuses = parsePorcelainStatus(
        (await runGit({ cwd: worktree.path, args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] })).stdout
      ).filter((status) => statusMatchesFilter(status, filter))
      const files = await Promise.all(
        statuses.map((status) =>
          createFileDiff({ cwd: worktree.path, status, filter, runGit, fileSystem, pathFlavor })
        )
      )
      const sorted = files.filter((file): file is GitFileDiff => file !== null).sort(compareFileDiffs)
      return sorted.length === 0
        ? { status: 'clean', branch, upstream, files: [] }
        : { status: 'ok', branch, upstream, files: sorted }
    } catch (error) {
      return {
        status: 'git-error',
        message: boundedErrorMessage(error instanceof Error ? error.message : 'Git query failed.')
      }
    }
  }

  async function observeProjectSession(
    sessionId: string,
    onEvent: (event: { kind: 'repository-changed' } | { kind: 'watch-error'; message: string }) => void
  ): Promise<() => void> {
    const root = await resolveProjectSessionWorktreePath(sessionId)
    if (!root.ok) {
      onEvent({ kind: 'watch-error', message: root.message })
      return () => undefined
    }

    const watchers: FSWatcher[] = []
    const close = (): void => {
      for (const watcher of watchers.splice(0)) watcher.close()
    }
    const emitChanged = (): void => onEvent({ kind: 'repository-changed' })
    const emitError = (error: unknown): void =>
      onEvent({
        kind: 'watch-error',
        message: boundedErrorMessage(error instanceof Error ? error.message : String(error))
      })

    try {
      watchers.push(
        watch(root.path, { recursive: true }, emitChanged).on('error', (error) => {
          emitError(error)
          close()
        })
      )
      const gitDir = await resolveGitDir(root.path, pathFlavor)
      if (gitDir) {
        watchers.push(
          watch(gitDir, { recursive: true }, emitChanged).on('error', (error) => {
            emitError(error)
            close()
          })
        )
      }
    } catch (error) {
      close()
      emitError(error)
      return () => undefined
    }

    return close
  }

  async function resolveProjectSessionWorktreePath(
    sessionId: string
  ): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    const session = await sessionsRepository.findSessionById(sessionId)
    if (!session || !session.projectId) {
      return { ok: false, message: 'Project Session not found.' }
    }

    const worktree = getSessionWorktree(session)
    if (!worktree) {
      return { ok: false, message: 'This Project Session has no managed worktree.' }
    }

    const project = await sessionsRepository.findProjectById(session.projectId)
    if (!project || project.archivedAt) {
      return { ok: false, message: 'The Project for this Session is unavailable.' }
    }

    const valid = await managedWorktreeService.validate({
      projectPath: project.path,
      projectId: session.projectId,
      sessionId: session.id,
      worktree
    })
    if (!valid) {
      return { ok: false, message: 'The managed worktree could not be authenticated.' }
    }

    return { ok: true, path: worktree.path }
  }

  return { getProjectSessionReview, observeProjectSession }
}

async function resolveGitDir(cwd: string, pathFlavor: PathFlavor): Promise<string | null> {
  try {
    const gitPath = pathFlavor.join(cwd, '.git')
    const stats = await lstat(gitPath)
    if (stats.isDirectory()) return gitPath
    if (!stats.isFile()) return null
    const content = await readFile(gitPath, 'utf8')
    const match = /^gitdir:\s*(.+)$/m.exec(content)
    if (!match) return null
    return pathFlavor.isAbsolute(match[1]) ? match[1] : pathFlavor.join(cwd, match[1])
  } catch {
    return null
  }
}

function getSessionWorktree(session: StoredSession) {
  if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) return null
  return {
    path: session.worktreePath,
    branch: session.worktreeBranch,
    baseRevision: session.worktreeBaseRevision
  }
}

async function getBranch(cwd: string, runGit: GitRunner): Promise<string> {
  const branch = (await runGit({ cwd, args: ['branch', '--show-current'] })).stdout.trim()
  if (branch) return branch
  return (await runGit({ cwd, args: ['rev-parse', '--short', 'HEAD'] })).stdout.trim()
}

async function getUpstream(cwd: string, runGit: GitRunner): Promise<GitUpstreamState> {
  const upstream = await runGit({
    cwd,
    args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    allowFailure: true
  })
  const name = upstream.stdout.trim()
  if (upstream.exitCode !== 0 || !name) return { kind: 'none' }

  const counts = await runGit({
    cwd,
    args: ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
    allowFailure: true
  })
  if (counts.exitCode !== 0) {
    throw new Error(counts.stderr.trim() || counts.stdout.trim() || 'Git upstream count query failed.')
  }
  const [ahead = '0', behind = '0'] = counts.stdout.trim().split(/\s+/)
  return { kind: 'tracked', name, ahead: Number(ahead) || 0, behind: Number(behind) || 0 }
}

type PorcelainStatus = {
  x: string
  y: string
  path: string
  oldPath?: string
}

function parsePorcelainStatus(output: string): PorcelainStatus[] {
  const entries = output.split('\0').filter(Boolean)
  const statuses: PorcelainStatus[] = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const x = entry[0] ?? ' '
    const y = entry[1] ?? ' '
    const path = entry.slice(3)
    if (x === 'R' || x === 'C') {
      const oldPath = entries[index + 1]
      index += 1
      statuses.push({ x, y, path, oldPath })
    } else {
      statuses.push({ x, y, path })
    }
  }
  return statuses
}

async function createFileDiff({
  cwd,
  status,
  filter,
  runGit,
  fileSystem,
  pathFlavor
}: {
  cwd: string
  status: PorcelainStatus
  filter: GitChangeFilter
  runGit: GitRunner
  fileSystem: UntrackedFileSystem
  pathFlavor: PathFlavor
}): Promise<GitFileDiff | null> {
  const kind = getChangeKind(status, filter)
  if (kind === 'untracked') return createUntrackedDiff(cwd, status.path, fileSystem, pathFlavor)

  const pathspecs = status.oldPath ? [status.oldPath, status.path] : [status.path]
  const diff = await runGit({
    cwd,
    args: createDiffArgs(filter, pathspecs),
    allowFailure: true
  })
  if (diff.exitCode !== 0) {
    if (isLikelyOversizedDiff(diff)) {
      return {
        path: status.path,
        oldPath: status.oldPath,
        kind,
        binary: false,
        large: true,
        diff: null
      }
    }
    throw new Error(
      boundedErrorMessage(diff.stderr.trim() || diff.stdout.trim() || `Git diff query failed for ${status.path}.`)
    )
  }
  const content = diff.stdout
  if (filter === 'uncommitted' && content.length === 0 && !isUnmergedStatus(status)) return null
  const binary = content.includes('GIT binary patch') || content.includes('Binary files ')
  const large = Buffer.byteLength(content, 'utf8') > MAX_DIFF_BYTES
  return {
    path: status.path,
    oldPath: status.oldPath,
    kind,
    binary,
    large,
    diff: binary || large ? null : content
  }
}

async function createUntrackedDiff(
  cwd: string,
  path: string,
  fileSystem: UntrackedFileSystem,
  pathFlavor: PathFlavor
): Promise<GitFileDiff> {
  try {
    const absolutePath = pathFlavor.join(cwd, path)
    const cwdRealPath = await fileSystem.realpath(cwd)
    const handle = await fileSystem.open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const openedStats = await handle.stat()
      const currentStats = await fileSystem.lstat(absolutePath)
      if (
        !openedStats.isFile() ||
        currentStats.isSymbolicLink() ||
        !currentStats.isFile() ||
        openedStats.dev !== currentStats.dev ||
        openedStats.ino !== currentStats.ino
      ) {
        return { path, kind: 'untracked', binary: false, large: false, diff: null }
      }
      const currentRealPath = await fileSystem.realpath(absolutePath)
      const verifiedStats = await fileSystem.lstat(absolutePath)
      if (
        !isPathInsideDirectory(currentRealPath, cwdRealPath, pathFlavor) ||
        verifiedStats.isSymbolicLink() ||
        !verifiedStats.isFile() ||
        openedStats.dev !== verifiedStats.dev ||
        openedStats.ino !== verifiedStats.ino
      ) {
        return { path, kind: 'untracked', binary: false, large: false, diff: null }
      }
      const bytes = await handle.readFile()
      const binary = bytes.includes(0)
      const large = bytes.byteLength > MAX_UNTRACKED_BYTES
      if (binary || large) return { path, kind: 'untracked', binary, large, diff: null }
      const text = bytes.toString('utf8')
      return {
        path,
        kind: 'untracked',
        binary: false,
        large: false,
        diff: `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n${text
          .split('\n')
          .map((line) => `+${line}`)
          .join('\n')}\n`
      }
    } finally {
      await handle.close()
    }
  } catch {
    return { path, kind: 'untracked', binary: false, large: false, diff: null }
  }
}

function isLikelyOversizedDiff(diff: Awaited<ReturnType<GitRunner>>): boolean {
  return Buffer.byteLength(diff.stdout, 'utf8') >= MAX_DIFF_BYTES
}

function boundedErrorMessage(message: string): string {
  const bytes = Buffer.from(message, 'utf8')
  if (bytes.byteLength <= MAX_ERROR_MESSAGE_BYTES) return message
  const ellipsis = Buffer.from('…', 'utf8')
  return `${bytes.subarray(0, MAX_ERROR_MESSAGE_BYTES - ellipsis.byteLength).toString('utf8')}…`
}

function isPathInsideDirectory(path: string, directory: string, pathFlavor: PathFlavor): boolean {
  const relativePath = pathFlavor.relative(directory, path)
  return (
    relativePath === '' ||
    Boolean(relativePath) &&
      !pathFlavor.isAbsolute(relativePath) &&
      !relativePath.startsWith('..') &&
      !relativePath.split(/[\\/]+/).includes('..')
  )
}

function statusMatchesFilter(status: PorcelainStatus, filter: GitChangeFilter): boolean {
  if (filter === 'uncommitted') return true
  if (isUnmergedStatus(status)) return true
  if (filter === 'staged') return status.x !== ' ' && status.x !== '?'
  return status.y !== ' ' || status.x === '?'
}

function createDiffArgs(filter: GitChangeFilter, pathspecs: string[]): string[] {
  const common = ['diff', '--no-ext-diff', '--find-renames=1%', '--binary']
  if (filter === 'staged') return [...common, '--cached', 'HEAD', '--', ...pathspecs]
  if (filter === 'unstaged') return [...common, '--', ...pathspecs]
  return [...common, 'HEAD', '--', ...pathspecs]
}

function getChangeKind(status: PorcelainStatus, filter: GitChangeFilter): GitFileDiff['kind'] {
  if (isUnmergedStatus(status)) return 'conflicted'
  if (status.x === '?' && status.y === '?') return 'untracked'
  if (filter === 'unstaged') {
    if (status.y === 'D') return 'deleted'
    return 'modified'
  }
  if (status.x === 'R') return 'renamed'
  if (status.x === 'A') return 'added'
  if (status.x === 'D' || status.y === 'D') return 'deleted'
  return 'modified'
}

function isUnmergedStatus(status: PorcelainStatus): boolean {
  return (
    status.x === 'U' ||
    status.y === 'U' ||
    status.x === 'A' && status.y === 'A' ||
    status.x === 'D' && status.y === 'D'
  )
}

function compareFileDiffs(left: GitFileDiff, right: GitFileDiff): number {
  if (left.kind === 'conflicted' && right.kind !== 'conflicted') return -1
  if (right.kind === 'conflicted' && left.kind !== 'conflicted') return 1
  return left.path.localeCompare(right.path, undefined, { sensitivity: 'base', numeric: true })
}

async function runGitCli({
  cwd,
  args,
  allowFailure = false
}: {
  cwd: string
  args: string[]
  allowFailure?: boolean
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    const result = {
      stdout: getExecText(error, 'stdout'),
      stderr: getExecText(error, 'stderr'),
      exitCode: getExecCode(error)
    }
    if (allowFailure) return result
    throw new Error(boundedErrorMessage(result.stderr.trim() || result.stdout.trim() || 'Git command failed.'), {
      cause: error
    })
  }
}

function getExecText(error: unknown, field: 'stdout' | 'stderr'): string {
  return typeof error === 'object' && error !== null && field in error ? String(error[field]) : ''
}

function getExecCode(error: unknown): number {
  return typeof error === 'object' && error !== null && 'code' in error ? Number(error.code) || 1 : 1
}
