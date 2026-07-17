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
