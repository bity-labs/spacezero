import type { z } from 'zod'

import type {
  getProjectSessionGitReviewSchema,
  observeProjectSessionGitSchema,
  unobserveProjectSessionGitSchema
} from './git.schema'

export const GIT_IPC_CHANNELS = {
  getProjectSessionReview: 'git:getProjectSessionReview',
  observeProjectSession: 'git:observeProjectSession',
  unobserveProjectSession: 'git:unobserveProjectSession',
  observationEvent: 'git:observationEvent'
} as const

export type GitReviewRequest = z.infer<typeof getProjectSessionGitReviewSchema>
export type GitObserveProjectSessionRequest = z.infer<typeof observeProjectSessionGitSchema>
export type GitUnobserveProjectSessionRequest = z.infer<typeof unobserveProjectSessionGitSchema>
export type GitObserveProjectSessionResponse = { subscriptionId: string }

export type GitChangeFilter = 'uncommitted' | 'unstaged' | 'staged'

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

export type GitObservationEvent =
  | { subscriptionId: string; sessionId: string; kind: 'repository-changed' }
  | { subscriptionId: string; sessionId: string; kind: 'watch-error'; message: string }

export type GitAPI = {
  getProjectSessionReview: (request: GitReviewRequest) => Promise<GitReviewState>
  observeProjectSession: (
    request: GitObserveProjectSessionRequest
  ) => Promise<GitObserveProjectSessionResponse>
  unobserveProjectSession: (request: GitUnobserveProjectSessionRequest) => Promise<void>
  onObservationEvent: (listener: (event: GitObservationEvent) => void) => () => void
}
