export type GitHubIdentity = {
  id: string
  login: string
  avatarUrl: string
  profileUrl: string
}

export type GitHubInstallationOwner = {
  id: string
  login: string
  type: 'user' | 'organization'
  avatarUrl: string
}

export type GitHubInstallationStatus =
  | 'usable'
  | 'pending-approval'
  | 'no-repositories'
  | 'suspended'
  | 'organization-authorization-required'

export type GitHubInstallation = {
  id: string
  owner: GitHubInstallationOwner
  repositorySelection: 'all' | 'selected'
  status: GitHubInstallationStatus
  repositoryCount: number
}

export type GitHubRepository = {
  id: string
  nodeId: string
  installationId: string
  owner: string
  name: string
  fullName: string
  isPrivate: boolean
  defaultBranch: string
  htmlUrl: string
  cloneUrl: string
}

export type GitHubConnection =
  | { status: 'disconnected' }
  | {
      status: 'repository-access-required'
      identity: GitHubIdentity
      installations?: GitHubInstallation[]
    }
  | {
      status: 'pending-organization-approval'
      identity: GitHubIdentity
      installations: GitHubInstallation[]
    }
  | {
      status: 'connected'
      identity: GitHubIdentity
      installations: GitHubInstallation[]
      repositories: GitHubRepository[]
    }
  | { status: 'reconnect-required'; identity: GitHubIdentity }

export type GitHubPage<T> = {
  items: T[]
  page: number
  hasNextPage: boolean
}

export type GitHubUser = {
  id: string
  login: string
  avatarUrl: string
}

export type GitHubLabel = {
  id: string
  name: string
  color: string
}

export type GitHubIssue = {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  htmlUrl: string
  author: GitHubUser | null
  labels: GitHubLabel[]
  assignees: GitHubUser[]
  commentCount: number
  createdAt: string
  updatedAt: string
}

export type GitHubIssueComment = {
  id: string
  body: string
  htmlUrl: string
  author: GitHubUser | null
  createdAt: string
  updatedAt: string
}

export type GitHubIssueListRequest = GitHubProjectRequest & {
  page: number
  perPage?: number
}

export type GitHubIssueRequest = GitHubProjectRequest & {
  number: number
}

export type GitHubIssueCommentsRequest = GitHubIssueRequest & {
  page: number
  perPage?: number
}

export type GitHubIssueCommentCreateRequest = GitHubIssueRequest & {
  body: string
}

export type GitHubIssueStateUpdateRequest = GitHubIssueRequest & {
  state: 'open' | 'closed'
}

export type GitHubPullRequestSummary = {
  number: number
  title: string
  state: 'open' | 'closed' | 'merged'
  isDraft: boolean
  htmlUrl: string
  author: GitHubUser | null
  baseBranch: string
  headBranch: string
  createdAt: string
  updatedAt: string
}

export type GitHubPullRequest = GitHubPullRequestSummary & {
  body: string | null
  commitCount: number
  conversationCommentCount: number
}

export type GitHubPullRequestListRequest = GitHubProjectRequest & {
  page: number
  perPage?: number
}

export type GitHubPullRequestRequest = GitHubProjectRequest & {
  number: number
}

export type GitHubPullRequestCommentsRequest = GitHubPullRequestRequest & {
  page: number
  perPage?: number
}

export type GitHubPullRequestPageRequest = GitHubPullRequestRequest & {
  page: number
  perPage?: number
}

export type GitHubPullRequestPatch =
  | { status: 'available'; text: string; truncated: boolean }
  | { status: 'binary' }
  | { status: 'omitted' }
  | { status: 'unavailable' }

export type GitHubPullRequestFile = {
  sha: string
  filename: string
  previousFilename: string | null
  status:
    'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged' | 'unknown'
  additions: number
  deletions: number
  changes: number
  patch: GitHubPullRequestPatch
}

export type GitHubCheckRun = {
  id: string
  name: string
  status: 'queued' | 'in_progress' | 'completed' | 'unknown'
  conclusion: string | null
  detailsUrl: string | null
  appName: string | null
  startedAt: string | null
  completedAt: string | null
}

export type GitHubCommitStatus = {
  id: string
  context: string
  state: 'error' | 'failure' | 'pending' | 'success' | 'unknown'
  description: string | null
  targetUrl: string | null
  updatedAt: string
}

export type GitHubPullRequestReview = {
  id: string
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending' | 'unknown'
  body: string | null
  htmlUrl: string
  author: GitHubUser | null
  submittedAt: string | null
}

export type GitHubRepositorySetupOption = {
  repository: GitHubRepository
  existingProject?: ProjectReference
}

export type ProjectReference = {
  id: string
  name: string
}

export type StartGitHubCloneRequest = {
  repositoryId: string
}

export type StartGitHubCloneResult =
  { status: 'already-added'; projectId: string } | { status: 'started'; operationId: string }

export type GitHubCloneProgress = {
  operationId: string
  status: 'starting' | 'cloning' | 'complete' | 'failed' | 'cancelled'
  message: string
  percent?: number
  projectId?: string
}

export type CancelGitHubCloneRequest = {
  operationId: string
}

export type GitHubProjectLinkOptions = {
  repositories: GitHubRepository[]
  suggestedRepositoryIds: string[]
  ambiguous: boolean
}

export type GitHubProjectRequest = {
  projectId: string
}

export type LinkGitHubProjectRequest = GitHubProjectRequest & {
  repositoryId: string
  confirmAmbiguous?: boolean
}

export type GitHubDeviceAuthorization = {
  flowId: string
  userCode: string
  verificationUri: string
  expiresAt: string
}

export type GitHubFlowRequest = {
  flowId: string
}
