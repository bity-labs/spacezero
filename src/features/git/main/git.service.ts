import { execFile } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { GitFileDiff, GitReviewState, GitUpstreamState } from '../shared'
import type { ManagedWorktreeService } from '../../sessions/main/managed-worktree.service'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'

const execFileAsync = promisify(execFile)
const MAX_DIFF_BYTES = 256 * 1024
const MAX_UNTRACKED_BYTES = 128 * 1024

export type GitService = ReturnType<typeof createGitService>

type GitRunner = (request: { cwd: string; args: string[]; allowFailure?: boolean }) => Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>

export function createGitService({
  sessionsRepository,
  managedWorktreeService,
  runGit = runGitCli
}: {
  sessionsRepository: SessionsRepository
  managedWorktreeService: ManagedWorktreeService
  runGit?: GitRunner
}) {
  async function getProjectSessionReview(sessionId: string): Promise<GitReviewState> {
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
      )
      const files = await Promise.all(
        statuses.map((status) => createFileDiff({ cwd: worktree.path, status, runGit }))
      )
      const sorted = files.sort(compareFileDiffs)
      return sorted.length === 0
        ? { status: 'clean', branch, upstream, files: [] }
        : { status: 'ok', branch, upstream, files: sorted }
    } catch (error) {
      return {
        status: 'git-error',
        message: error instanceof Error ? error.message : 'Git query failed.'
      }
    }
  }

  return { getProjectSessionReview }
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
  runGit
}: {
  cwd: string
  status: PorcelainStatus
  runGit: GitRunner
}): Promise<GitFileDiff> {
  const kind = getChangeKind(status)
  if (kind === 'untracked') return createUntrackedDiff(cwd, status.path)

  const pathspecs = status.oldPath ? [status.oldPath, status.path] : [status.path]
  const diff = await runGit({
    cwd,
    args: ['diff', '--no-ext-diff', '--find-renames=1%', '--binary', 'HEAD', '--', ...pathspecs],
    allowFailure: true
  })
  if (diff.exitCode !== 0) {
    throw new Error(diff.stderr.trim() || diff.stdout.trim() || `Git diff query failed for ${status.path}.`)
  }
  const content = diff.stdout
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

async function createUntrackedDiff(cwd: string, path: string): Promise<GitFileDiff> {
  try {
    const absolutePath = join(cwd, path)
    const stats = await lstat(absolutePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return { path, kind: 'untracked', binary: false, large: false, diff: null }
    }
    const bytes = await readFile(absolutePath)
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
  } catch {
    return { path, kind: 'untracked', binary: false, large: false, diff: null }
  }
}

function getChangeKind(status: PorcelainStatus): GitFileDiff['kind'] {
  if (status.x === 'U' || status.y === 'U' || status.x === 'A' && status.y === 'A' || status.x === 'D' && status.y === 'D') {
    return 'conflicted'
  }
  if (status.x === '?' && status.y === '?') return 'untracked'
  if (status.x === 'R') return 'renamed'
  if (status.x === 'A') return 'added'
  if (status.x === 'D' || status.y === 'D') return 'deleted'
  return 'modified'
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
      maxBuffer: MAX_DIFF_BYTES * 2
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    const result = {
      stdout: getExecText(error, 'stdout'),
      stderr: getExecText(error, 'stderr'),
      exitCode: getExecCode(error)
    }
    if (allowFailure) return result
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'Git command failed.', {
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
