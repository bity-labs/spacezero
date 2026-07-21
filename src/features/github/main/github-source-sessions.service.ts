import type {
  GitHubCheckRun,
  GitHubCommitStatus,
  GitHubIssue,
  GitHubIssueComment,
  GitHubPage,
  GitHubPullRequest,
  GitHubPullRequestFile,
  GitHubPullRequestReview,
  GitHubRepository
} from '../shared'
import type { CreateManagedProjectAgentSessionRequest } from '../../agent-workspace/main/agent-session-handler'
import type { ProjectSession, SessionGitHubSource } from '../../sessions/shared'

type PullRequestPageRequest = {
  projectId: string
  number: number
  page: number
  perPage?: number
}

type PullRequestSource = {
  getPullRequest: (request: { projectId: string; number: number }) => Promise<GitHubPullRequest>
  listConversationComments: (
    request: PullRequestPageRequest
  ) => Promise<GitHubPage<GitHubIssueComment>>
  listFiles: (request: PullRequestPageRequest) => Promise<GitHubPage<GitHubPullRequestFile>>
  listCheckRuns: (request: PullRequestPageRequest) => Promise<GitHubPage<GitHubCheckRun>>
  listCommitStatuses: (request: PullRequestPageRequest) => Promise<GitHubPage<GitHubCommitStatus>>
  listReviews: (request: PullRequestPageRequest) => Promise<GitHubPage<GitHubPullRequestReview>>
}

export function createGitHubSourceSessionsService({
  projects,
  issues,
  pullRequests,
  auth,
  createSession
}: {
  projects: {
    getLinkedRepository: (request: { projectId: string }) => Promise<GitHubRepository>
  }
  issues: {
    getIssue: (request: { projectId: string; number: number }) => Promise<GitHubIssue>
    listIssueComments: (request: {
      projectId: string
      number: number
      page: number
      perPage?: number
    }) => Promise<GitHubPage<GitHubIssueComment>>
  }
  pullRequests?: PullRequestSource
  auth?: { getAuthorizedCredential: () => Promise<{ accessToken: string }> }
  createSession: (
    request: CreateManagedProjectAgentSessionRequest
  ) => Promise<{ session: ProjectSession }>
}) {
  async function startIssueSession(request: {
    projectId: string
    number: number
  }): Promise<ProjectSession> {
    const projectId = request.projectId.trim()
    const [repository, issue] = await Promise.all([
      projects.getLinkedRepository({ projectId }),
      issues.getIssue({ projectId, number: request.number })
    ])
    const comments = await issues
      .listIssueComments({ projectId, number: request.number, page: 1, perPage: 20 })
      .then((page) => page.items)
      .catch(() => [])
    const source = createSource('issue', repository, issue)
    const { session } = await createSession({
      projectId,
      title: `Issue #${issue.number}: ${issue.title}`,
      source,
      systemPromptContext: createIssueContext(repository, issue, comments)
    })
    return session
  }

  async function startPullRequestSession(request: {
    projectId: string
    number: number
  }): Promise<ProjectSession> {
    if (!pullRequests || !auth) throw new Error('github.sourceSessionNotConfigured')
    const projectId = request.projectId.trim()
    const [repository, pullRequest, credential] = await Promise.all([
      projects.getLinkedRepository({ projectId }),
      pullRequests.getPullRequest({ projectId, number: request.number }),
      auth.getAuthorizedCredential()
    ])
    const pageRequest = { projectId, number: request.number, page: 1, perPage: 30 }
    const [comments, files, checkRuns, statuses, reviews] = await Promise.all([
      loadAvailableItems(() => pullRequests.listConversationComments(pageRequest)),
      loadAvailableItems(() => pullRequests.listFiles(pageRequest)),
      loadAvailableItems(() => pullRequests.listCheckRuns(pageRequest)),
      loadAvailableItems(() => pullRequests.listCommitStatuses(pageRequest)),
      loadAvailableItems(() => pullRequests.listReviews(pageRequest))
    ])
    const source = createSource('pull-request', repository, pullRequest)
    const { session } = await createSession({
      projectId,
      title: `Pull Request #${pullRequest.number}: ${pullRequest.title}`,
      source,
      startPoint: {
        kind: 'github-ref',
        remoteUrl: repository.cloneUrl,
        ref: `refs/pull/${pullRequest.number}/head`,
        accessToken: credential.accessToken
      },
      systemPromptContext: createPullRequestContext(repository, pullRequest, {
        comments,
        files,
        checkRuns,
        statuses,
        reviews
      })
    })
    return session
  }

  return { startIssueSession, startPullRequestSession }
}

function createSource(
  type: SessionGitHubSource['type'],
  repository: GitHubRepository,
  item: { number: number; htmlUrl: string; title: string }
): SessionGitHubSource {
  return {
    type,
    repositoryId: repository.id,
    repositoryNodeId: repository.nodeId,
    repositoryOwner: repository.owner,
    repositoryName: repository.name,
    repositoryFullName: repository.fullName,
    number: item.number,
    url: item.htmlUrl,
    title: item.title
  }
}

function createIssueContext(
  repository: GitHubRepository,
  issue: GitHubIssue,
  comments: GitHubIssueComment[]
): string {
  const commentContext = comments.slice(0, 20).map((comment) => {
    return `- ${comment.author?.login ?? 'ghost'}: ${truncate(comment.body, 2_000)}`
  })
  return [
    '## Space Zero linked GitHub Issue (live at Session creation)',
    `Repository: ${repository.fullName} (stable id ${repository.id})`,
    `Issue: #${issue.number} — ${issue.title}`,
    `URL: ${issue.htmlUrl}`,
    `State: ${issue.state}`,
    `Author: ${issue.author?.login ?? 'ghost'}`,
    `Labels: ${issue.labels.map((label) => label.name).join(', ') || 'none'}`,
    `Assignees: ${issue.assignees.map((assignee) => assignee.login).join(', ') || 'none'}`,
    '',
    'Description:',
    truncate(issue.body ?? 'No description provided.', 12_000),
    '',
    'Recent conversation comments:',
    ...(commentContext.length ? commentContext : ['- None loaded.']),
    '',
    'Use this as the source context for the work. Do not mutate GitHub unless the builder explicitly asks.'
  ].join('\n')
}

function createPullRequestContext(
  repository: GitHubRepository,
  pullRequest: GitHubPullRequest,
  context: {
    comments: GitHubIssueComment[]
    files: GitHubPullRequestFile[]
    checkRuns: GitHubCheckRun[]
    statuses: GitHubCommitStatus[]
    reviews: GitHubPullRequestReview[]
  }
): string {
  return [
    '## Space Zero linked GitHub Pull Request (live at Session creation)',
    `Repository: ${repository.fullName} (stable id ${repository.id})`,
    `Pull Request: #${pullRequest.number} — ${pullRequest.title}`,
    `URL: ${pullRequest.htmlUrl}`,
    `State: ${pullRequest.state}${pullRequest.isDraft ? ' (draft)' : ''}`,
    `Author: ${pullRequest.author?.login ?? 'ghost'}`,
    `Branches: ${pullRequest.headBranch} -> ${pullRequest.baseBranch}`,
    `Commits: ${pullRequest.commitCount}`,
    '',
    'Description:',
    truncate(pullRequest.body ?? 'No description provided.', 12_000),
    '',
    'Changed files (bounded first page):',
    ...toLines(
      context.files,
      (file) => `- ${file.status}: ${file.filename} (+${file.additions}/-${file.deletions})`
    ),
    '',
    'Checks and commit statuses (bounded first page):',
    ...toLines(
      context.checkRuns,
      (check) => `- Check ${check.name}: ${check.conclusion ?? check.status}`
    ),
    ...toLines(context.statuses, (status) => `- Status ${status.context}: ${status.state}`),
    '',
    'Submitted reviews (bounded first page):',
    ...toLines(
      context.reviews,
      (review) =>
        `- ${review.author?.login ?? 'ghost'}: ${review.state}${review.body ? ` — ${truncate(review.body, 1_000)}` : ''}`
    ),
    '',
    'Conversation comments (bounded first page):',
    ...toLines(
      context.comments,
      (comment) => `- ${comment.author?.login ?? 'ghost'}: ${truncate(comment.body, 1_000)}`
    ),
    '',
    'Inspect and work in this isolated Pull Request revision. Do not comment, approve, request changes, merge, close, or otherwise mutate GitHub unless the builder explicitly asks.'
  ].join('\n')
}

async function loadAvailableItems<T>(load: () => Promise<GitHubPage<T>>): Promise<T[]> {
  return load()
    .then((page) => page.items)
    .catch(() => [])
}

function toLines<T>(items: T[], render: (item: T) => string): string[] {
  return items.length ? items.map(render) : ['- None loaded.']
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value
  return `${value.slice(0, maximumLength)}\n[…truncated by Space Zero…]`
}
