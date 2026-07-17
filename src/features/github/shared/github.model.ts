export type GitHubIdentity = {
  id: string
  login: string
  avatarUrl: string
  profileUrl: string
}

export type GitHubConnection =
  | { status: 'disconnected' }
  | { status: 'repository-access-required'; identity: GitHubIdentity }
  | { status: 'reconnect-required'; identity: GitHubIdentity }

export type GitHubDeviceAuthorization = {
  flowId: string
  userCode: string
  verificationUri: string
  expiresAt: string
}

export type GitHubFlowRequest = {
  flowId: string
}
