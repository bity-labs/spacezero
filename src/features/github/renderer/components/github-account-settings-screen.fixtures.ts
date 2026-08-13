import type { GitHubAccountSettingsScreenProps } from './github-account-settings-screen'

const noOp = (): void => undefined
const avatarUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" rx="20" fill="%236366f1"/%3E%3Ctext x="20" y="26" text-anchor="middle" font-size="18" fill="white"%3EO%3C/text%3E%3C/svg%3E'

export const disconnectedGitHubAccountFixture = {
  connection: { status: 'disconnected' },
  isLoading: false,
  error: null,
  authorization: null,
  copied: false,
  onStartAuthorization: noOp,
  onCancelAuthorization: noOp,
  onCopyCode: noOp,
  onOpenAuthorization: noOp,
  onOpenInstallation: noOp,
  onCheckRepositoryAccess: noOp,
  onOpenManageAccess: noOp,
  onDisconnect: noOp
} satisfies GitHubAccountSettingsScreenProps

export const deviceCodeGitHubAccountFixture = {
  ...disconnectedGitHubAccountFixture,
  authorization: {
    flowId: 'storybook-device-flow',
    userCode: 'ZERO-CODE',
    verificationUri: 'https://github.com/login/device',
    expiresAt: '2027-01-01T12:15:00.000Z'
  }
} satisfies GitHubAccountSettingsScreenProps

export const connectedGitHubAccountFixture = {
  ...disconnectedGitHubAccountFixture,
  connection: {
    status: 'connected',
    identity: {
      id: '42',
      login: 'octocat',
      avatarUrl,
      profileUrl: 'https://github.com/octocat'
    },
    installations: [
      {
        id: '100',
        owner: {
          id: '42',
          login: 'octocat',
          type: 'user',
          avatarUrl
        },
        repositorySelection: 'selected',
        status: 'usable',
        repositoryCount: 2
      },
      {
        id: '200',
        owner: {
          id: '84',
          login: 'bity-labs',
          type: 'organization',
          avatarUrl
        },
        repositorySelection: 'all',
        status: 'usable',
        repositoryCount: 6
      }
    ],
    repositories: [
      {
        id: '1000',
        nodeId: 'R_1000',
        installationId: '100',
        owner: 'octocat',
        name: 'hello-world',
        fullName: 'octocat/hello-world',
        isPrivate: false,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/octocat/hello-world',
        cloneUrl: 'https://github.com/octocat/hello-world.git'
      },
      {
        id: '2000',
        nodeId: 'R_2000',
        installationId: '200',
        owner: 'bity-labs',
        name: 'spacezero',
        fullName: 'bity-labs/spacezero',
        isPrivate: true,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/bity-labs/spacezero',
        cloneUrl: 'https://github.com/bity-labs/spacezero.git'
      }
    ]
  }
} satisfies GitHubAccountSettingsScreenProps

export const errorGitHubAccountFixture = {
  ...disconnectedGitHubAccountFixture,
  error: 'Unable to read the GitHub connection. Check your connection and try again.'
} satisfies GitHubAccountSettingsScreenProps
