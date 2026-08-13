import { ProjectGitHubOverviewView } from '../../../github/renderer'
import type {
  GitHubIssue,
  GitHubPullRequestSummary,
  GitHubRepository
} from '../../../github/shared'
import type { Project } from '../../shared'
import type { ProjectHomeScreenProps } from './project-home-screen'

const noOp = (): void => undefined

const localProject: Project = {
  id: 'project-1',
  name: 'Space Zero',
  path: '/Users/builder/Projects/spacezero',
  agentResourcesTrusted: false,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z'
}

const repository: GitHubRepository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

const linkedProject: Project = {
  ...localProject,
  githubRepository: {
    repositoryId: repository.id,
    nodeId: repository.nodeId,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    htmlUrl: repository.htmlUrl,
    linkedAt: '2026-07-18T01:00:00.000Z'
  }
}

const issue: GitHubIssue = {
  number: 454,
  title: 'Add Project Home stories',
  body: null,
  state: 'open',
  htmlUrl: 'https://github.com/bity-labs/spacezero/issues/454',
  author: { id: '42', login: 'builder', avatarUrl: 'https://avatars.example/42' },
  labels: [],
  assignees: [],
  commentCount: 2,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z'
}

const pullRequest: GitHubPullRequestSummary = {
  number: 470,
  title: 'Add project Session stories',
  state: 'open',
  isDraft: false,
  htmlUrl: 'https://github.com/bity-labs/spacezero/pull/470',
  author: { id: '42', login: 'builder', avatarUrl: 'https://avatars.example/42' },
  baseBranch: 'prd-446-integration',
  headBranch: 'issue-451',
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T01:00:00.000Z'
}

const baseFixture = {
  project: localProject,
  activeView: 'overview',
  isStartingSession: false,
  sessionSetupError: null,
  githubState: { status: 'local-only' },
  agentResourceTrust: { trusted: false, isSaving: false, error: null },
  summaryContent: null,
  workflowContent: null,
  onSelectView: noOp,
  onNewSession: noOp,
  onLoadLinkOptions: noOp,
  onSelectRepository: noOp,
  onLinkRepository: noOp,
  onRetryRepository: noOp,
  onAgentResourceTrustChange: noOp
} satisfies ProjectHomeScreenProps

function summaryContent({
  issues,
  pullRequests
}: {
  issues: {
    loading: boolean
    refreshing: boolean
    error: string | null
    items: GitHubIssue[]
  }
  pullRequests: {
    loading: boolean
    refreshing: boolean
    error: string | null
    items: GitHubPullRequestSummary[]
  }
}): React.JSX.Element {
  return (
    <ProjectGitHubOverviewView
      issues={issues}
      pullRequests={pullRequests}
      onOpenIssue={noOp}
      onViewIssues={noOp}
      onRetryIssues={noOp}
      onRefreshIssues={noOp}
      onOpenPullRequest={noOp}
      onViewPullRequests={noOp}
      onRetryPullRequests={noOp}
      onRefreshPullRequests={noOp}
    />
  )
}

const connectedBaseFixture = {
  ...baseFixture,
  project: linkedProject,
  githubState: { status: 'connected', repository }
} satisfies ProjectHomeScreenProps

export const localOnlyProjectHomeFixture = baseFixture

export const githubDisconnectedProjectHomeFixture = {
  ...baseFixture,
  githubState: { status: 'disconnected' }
} satisfies ProjectHomeScreenProps

export const repositoryLinkNeededProjectHomeFixture = {
  ...baseFixture,
  githubState: {
    status: 'link-needed',
    linkOptions: null,
    selectedRepositoryId: null,
    error: null,
    isLoadingOptions: false,
    isSavingLink: false
  }
} satisfies ProjectHomeScreenProps

export const repositoryConnectedProjectHomeFixture = {
  ...connectedBaseFixture,
  summaryContent: summaryContent({
    issues: { loading: false, refreshing: false, error: null, items: [issue] },
    pullRequests: { loading: false, refreshing: false, error: null, items: [pullRequest] }
  })
} satisfies ProjectHomeScreenProps

export const summariesLoadingProjectHomeFixture = {
  ...connectedBaseFixture,
  summaryContent: summaryContent({
    issues: { loading: true, refreshing: true, error: null, items: [] },
    pullRequests: { loading: true, refreshing: true, error: null, items: [] }
  })
} satisfies ProjectHomeScreenProps

export const summariesErrorProjectHomeFixture = {
  ...connectedBaseFixture,
  summaryContent: summaryContent({
    issues: {
      loading: false,
      refreshing: false,
      error: 'Issues could not be loaded.',
      items: []
    },
    pullRequests: {
      loading: false,
      refreshing: false,
      error: 'Pull Requests could not be loaded.',
      items: []
    }
  })
} satisfies ProjectHomeScreenProps

export const summariesEmptyProjectHomeFixture = {
  ...connectedBaseFixture,
  summaryContent: summaryContent({
    issues: { loading: false, refreshing: false, error: null, items: [] },
    pullRequests: { loading: false, refreshing: false, error: null, items: [] }
  })
} satisfies ProjectHomeScreenProps

export const trustOffProjectHomeFixture = baseFixture

export const trustOnProjectHomeFixture = {
  ...baseFixture,
  project: { ...localProject, agentResourcesTrusted: true },
  agentResourceTrust: { trusted: true, isSaving: false, error: null }
} satisfies ProjectHomeScreenProps
