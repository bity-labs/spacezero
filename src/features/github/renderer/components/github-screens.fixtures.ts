import type {
  GitHubCheckRun,
  GitHubIssue,
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubPullRequestReview,
  GitHubRepositorySetupOption
} from '../../shared'

export const repositoryOptionsFixture: GitHubRepositorySetupOption[] = [
  {
    repository: {
      id: 'repository-1',
      nodeId: 'R_repository1',
      installationId: 'installation-1',
      owner: 'bity-labs',
      name: 'spacezero',
      fullName: 'bity-labs/spacezero',
      isPrivate: true,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/spacezero',
      cloneUrl: 'https://github.com/bity-labs/spacezero.git'
    }
  },
  {
    repository: {
      id: 'repository-2',
      nodeId: 'R_repository2',
      installationId: 'installation-1',
      owner: 'bity-labs',
      name: 'design-system',
      fullName: 'bity-labs/design-system',
      isPrivate: false,
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/bity-labs/design-system',
      cloneUrl: 'https://github.com/bity-labs/design-system.git'
    },
    existingProject: { id: 'project-2', name: 'Design System' }
  }
]

export const issueFixture: GitHubIssue = {
  number: 455,
  title: 'Add GitHub Storybook coverage',
  body: 'Make the repository, Issue, and Pull Request surfaces **designable without Electron**.',
  state: 'open',
  htmlUrl: 'https://github.com/bity-labs/spacezero/issues/455',
  author: { id: 'user-1', login: 'octocat', avatarUrl: 'https://avatars.example/octocat' },
  labels: [{ id: 'label-1', name: 'ready-for-agent', color: '0e8a16' }],
  assignees: [{ id: 'user-2', login: 'builder', avatarUrl: 'https://avatars.example/builder' }],
  commentCount: 2,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T03:00:00.000Z'
}

export const secondIssueFixture: GitHubIssue = {
  ...issueFixture,
  number: 453,
  title: 'Add project Storybook coverage',
  state: 'closed',
  htmlUrl: 'https://github.com/bity-labs/spacezero/issues/453',
  commentCount: 5
}

export const issueCommentsFixture: GitHubIssueComment[] = [
  {
    id: 'comment-1',
    body: 'The loading and error states should remain visible at realistic widths.',
    htmlUrl: 'https://github.com/bity-labs/spacezero/issues/455#issuecomment-1',
    author: { id: 'user-2', login: 'builder', avatarUrl: 'https://avatars.example/builder' },
    createdAt: '2026-07-18T01:00:00.000Z',
    updatedAt: '2026-07-18T01:00:00.000Z'
  },
  {
    id: 'comment-2',
    body: 'Use fixtures and keep the stories free of preload calls.',
    htmlUrl: 'https://github.com/bity-labs/spacezero/issues/455#issuecomment-2',
    author: { id: 'user-1', login: 'octocat', avatarUrl: 'https://avatars.example/octocat' },
    createdAt: '2026-07-18T02:00:00.000Z',
    updatedAt: '2026-07-18T02:00:00.000Z'
  }
]

export const pullRequestFixture: GitHubPullRequest = {
  number: 471,
  title: 'Add files tool stories',
  body: 'Adds pure Files views and reusable visual fixtures.',
  state: 'open',
  isDraft: false,
  htmlUrl: 'https://github.com/bity-labs/spacezero/pull/471',
  author: { id: 'user-1', login: 'octocat', avatarUrl: 'https://avatars.example/octocat' },
  baseBranch: 'prd-446-integration',
  headBranch: 'issue-456-files-tool-stories',
  commitCount: 3,
  conversationCommentCount: 1,
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T04:00:00.000Z'
}

export const secondPullRequestFixture: GitHubPullRequest = {
  ...pullRequestFixture,
  number: 469,
  title: 'Add session stories',
  isDraft: true,
  htmlUrl: 'https://github.com/bity-labs/spacezero/pull/469',
  headBranch: 'issue-451-session-stories'
}

export const pullRequestChecksFixture: GitHubCheckRun[] = [
  {
    id: 'check-1',
    name: 'test',
    status: 'completed',
    conclusion: 'success',
    detailsUrl: 'https://github.com/bity-labs/spacezero/actions/runs/1',
    appName: 'GitHub Actions',
    startedAt: '2026-07-18T04:00:00.000Z',
    completedAt: '2026-07-18T04:02:00.000Z'
  },
  {
    id: 'check-2',
    name: 'storybook:build',
    status: 'in_progress',
    conclusion: null,
    detailsUrl: null,
    appName: 'GitHub Actions',
    startedAt: '2026-07-18T04:00:00.000Z',
    completedAt: null
  }
]

export const pullRequestReviewsFixture: GitHubPullRequestReview[] = [
  {
    id: 'review-1',
    state: 'approved',
    body: 'Looks good to ship.',
    htmlUrl: 'https://github.com/bity-labs/spacezero/pull/471#pullrequestreview-1',
    author: { id: 'user-3', login: 'reviewer', avatarUrl: 'https://avatars.example/reviewer' },
    submittedAt: '2026-07-18T05:00:00.000Z'
  },
  {
    id: 'review-2',
    state: 'commented',
    body: 'Verified the pure view boundary.',
    htmlUrl: 'https://github.com/bity-labs/spacezero/pull/471#pullrequestreview-2',
    author: { id: 'user-2', login: 'builder', avatarUrl: 'https://avatars.example/builder' },
    submittedAt: '2026-07-18T05:30:00.000Z'
  }
]
