export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'

export type ProjectSession = {
  id: string
  projectId: string
  title: string
  status: SessionStatus
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
