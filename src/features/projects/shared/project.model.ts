export type Project = {
  id: string
  name: string
  path: string
  knowledgeBasePath?: string
  setupWarning?: string
  createdAt: string
  updatedAt: string
}

export type CreateEmptyProjectRequest = {
  name: string
}

export type UpdateProjectRequest = {
  id: string
  name: string
  path: string
}
