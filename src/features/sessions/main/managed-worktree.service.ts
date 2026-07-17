import { join } from 'node:path'

import type { SessionGitHubSource, SessionWorktree } from '../shared'

export type ManagedWorktreeStartPoint =
  | { kind: 'current-head' }
  | {
      kind: 'github-ref'
      remoteUrl: string
      ref: string
      accessToken: string
    }

export type ManagedWorktreeAdapter = {
  create: (request: {
    projectPath: string
    destination: string
    branch: string
    startPoint: ManagedWorktreeStartPoint
  }) => Promise<{ baseRevision: string }>
  remove: (request: { projectPath: string; destination: string; branch: string }) => Promise<void>
  validate: (path: string) => Promise<boolean>
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

  async function remove(projectPath: string, worktree: SessionWorktree): Promise<void> {
    await adapter.remove({
      projectPath,
      destination: worktree.path,
      branch: worktree.branch
    })
  }

  return { create, remove, validate: adapter.validate }
}

function createBranchName(
  sessionId: string,
  source: Pick<SessionGitHubSource, 'type' | 'number'> | undefined
): string {
  const suffix = sessionId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 24)
  if (!source) return `spacezero/session-${suffix}`
  return `spacezero/${source.type}-${source.number}-${suffix}`
}

function assertSafeSegment(value: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('session.invalidWorktreeIdentifier')
}
