export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'

export type SessionGitHubSource = {
  type: 'issue' | 'pull-request'
  repositoryId: string
  repositoryNodeId: string
  repositoryOwner: string
  repositoryName: string
  repositoryFullName: string
  number: number
  url: string
  title: string
}

export type SessionWorktree = {
  path: string
  branch: string
  baseRevision: string
}

export type ProjectSession = {
  id: string
  kind?: 'project'
  projectId: string
  title: string
  status: SessionStatus
  worktree?: SessionWorktree
  source?: SessionGitHubSource
  createdAt: string
  updatedAt: string
}

export type WorkspaceSession = {
  id: string
  kind: 'workspace'
  title: string
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export type CreateProjectSessionRequest = {
  projectId: string
  title?: string
}

export type RenameSessionTitleRequest = {
  sessionId: string
  title: string
}

export type Session = ProjectSession | WorkspaceSession
