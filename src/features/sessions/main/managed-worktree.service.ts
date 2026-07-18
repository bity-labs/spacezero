import { basename, dirname, join, resolve } from 'node:path'

import type { SessionGitHubSource, SessionWorktree } from '../shared'

export type ManagedWorktreeStartPoint =
  | { kind: 'current-head' }
  | {
      kind: 'github-ref'
      remoteUrl: string
      ref: string
      accessToken: string
    }

type ManagedWorktreeAdapterIdentity = {
  projectPath: string
  destination: string
  branch: string
  baseRevision: string
}

export type ManagedWorktreeIdentity = {
  projectPath: string
  projectId: string
  sessionId: string
  worktree: SessionWorktree
}

export type ManagedWorktreeAdapter = {
  create: (request: {
    projectPath: string
    destination: string
    branch: string
    startPoint: ManagedWorktreeStartPoint
  }) => Promise<{ baseRevision: string }>
  remove: (request: ManagedWorktreeAdapterIdentity) => Promise<void>
  validate: (request: ManagedWorktreeAdapterIdentity) => Promise<boolean>
}

export type ManagedWorktreeService = ReturnType<typeof createManagedWorktreeService>

export function createManagedWorktreeService({
  adapter,
  getWorktreesPath
}: {
  adapter: ManagedWorktreeAdapter
  getWorktreesPath: () => Promise<string>
}) {
  async function create(request: {
    projectPath: string
    projectId: string
    sessionId: string
    source?: Pick<SessionGitHubSource, 'type' | 'number'>
    startPoint?: ManagedWorktreeStartPoint
  }): Promise<SessionWorktree> {
    assertSafeSegment(request.projectId)
    assertSafeSegment(request.sessionId)
    const destination = join(await getWorktreesPath(), request.projectId, request.sessionId)
    const branch = createBranchName(request.sessionId, request.source)
    const { baseRevision } = await adapter.create({
      projectPath: request.projectPath,
      destination,
      branch,
      startPoint: request.startPoint ?? { kind: 'current-head' }
    })
    return { path: destination, branch, baseRevision }
  }

  async function remove(request: ManagedWorktreeIdentity): Promise<void> {
    if (!(await hasExpectedManagedDestination(request))) {
      throw new Error('session.worktreeOutsideManagedRoot')
    }
    await adapter.remove({
      projectPath: request.projectPath,
      destination: request.worktree.path,
      branch: request.worktree.branch,
      baseRevision: request.worktree.baseRevision
    })
  }

  async function validate(request: ManagedWorktreeIdentity): Promise<boolean> {
    if (!(await hasExpectedManagedDestination(request))) return false
    return adapter.validate({
      projectPath: request.projectPath,
      destination: request.worktree.path,
      branch: request.worktree.branch,
      baseRevision: request.worktree.baseRevision
    })
  }

  async function hasExpectedManagedDestination(request: ManagedWorktreeIdentity): Promise<boolean> {
    if (!isSafeSegment(request.projectId) || !isSafeSegment(request.sessionId)) return false
    if (!isManagedBranchForSession(request.worktree.branch, request.sessionId)) return false
    const expected = join(await getWorktreesPath(), request.projectId, request.sessionId)
    if (comparablePath(request.worktree.path) === comparablePath(expected)) return true

    // Existing worktrees stay at their persisted old Home after the Home setting changes.
    const persistedPath = resolve(request.worktree.path)
    const persistedProjectPath = dirname(persistedPath)
    const persistedWorktreesPath = dirname(persistedProjectPath)
    return (
      comparableSegment(basename(persistedPath)) === comparableSegment(request.sessionId) &&
      comparableSegment(basename(persistedProjectPath)) === comparableSegment(request.projectId) &&
      comparableSegment(basename(persistedWorktreesPath)) === comparableSegment('worktrees')
    )
  }

  return { create, remove, validate }
}

function createBranchName(
  sessionId: string,
  source: Pick<SessionGitHubSource, 'type' | 'number'> | undefined
): string {
  const suffix = sessionId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 24)
  if (!source) return `spacezero/session-${suffix}`
  return `spacezero/${source.type}-${source.number}-${suffix}`
}

function isManagedBranchForSession(branch: string, sessionId: string): boolean {
  const suffix = sessionId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 24)
  return (
    branch === `spacezero/session-${suffix}` ||
    new RegExp(`^spacezero/(?:issue|pull-request)-[1-9][0-9]*-${suffix}$`).test(branch)
  )
}

function assertSafeSegment(value: string): void {
  if (!isSafeSegment(value)) throw new Error('session.invalidWorktreeIdentifier')
}

function isSafeSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value)
}

function comparablePath(path: string): string {
  return comparableSegment(resolve(path))
}

function comparableSegment(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value
}
