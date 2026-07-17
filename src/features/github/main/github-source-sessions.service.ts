import type { GitHubIssue, GitHubIssueComment, GitHubPage, GitHubRepository } from '../shared'
import type { CreateManagedProjectAgentSessionRequest } from '../../agent-workspace/main/agent-session-handler'
import type { ProjectSession, SessionGitHubSource } from '../../sessions/shared'

export function createGitHubSourceSessionsService({
  projects,
  issues,
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
    const source: SessionGitHubSource = {
      type: 'issue',
      repositoryId: repository.id,
      repositoryNodeId: repository.nodeId,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      repositoryFullName: repository.fullName,
      number: issue.number,
      url: issue.htmlUrl,
      title: issue.title
    }
    const { session } = await createSession({
      projectId,
      title: `Issue #${issue.number}: ${issue.title}`,
      source,
      systemPromptContext: createIssueContext(repository, issue, comments)
    })
    return session
  }

  return { startIssueSession }
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

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value
  return `${value.slice(0, maximumLength)}\n[…truncated by Space Zero…]`
}
