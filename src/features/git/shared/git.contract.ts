import type { z } from 'zod'

import type { getProjectSessionGitReviewSchema } from './git.schema'

export const GIT_IPC_CHANNELS = {
  getProjectSessionReview: 'git:getProjectSessionReview'
} as const

export type GitReviewRequest = z.infer<typeof getProjectSessionGitReviewSchema>

export type GitUpstreamState =
  | { kind: 'none' }
  | { kind: 'tracked'; name: string; ahead: number; behind: number }

export type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted' | 'untracked'

export type GitFileDiff = {
  path: string
  oldPath?: string
  kind: GitChangeKind
  binary: boolean
  large: boolean
  diff: string | null
}

export type GitReviewOkState = {
  status: 'ok'
  branch: string
  upstream: GitUpstreamState
  files: GitFileDiff[]
}

export type GitReviewState =
  | GitReviewOkState
  | { status: 'clean'; branch: string; upstream: GitUpstreamState; files: [] }
  | { status: 'missing-worktree'; message: string }
  | { status: 'inaccessible'; message: string }
  | { status: 'git-error'; message: string }

export type GitAPI = {
  getProjectSessionReview: (request: GitReviewRequest) => Promise<GitReviewState>
}
