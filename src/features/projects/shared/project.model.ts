export type GitHubRepositoryAssociation = {
  repositoryId: string
  nodeId: string
  owner: string
  name: string
  fullName: string
  htmlUrl: string
  linkedAt: string
}

export type Project = {
  id: string
  name: string
  path: string
  knowledgeBasePath?: string
  setupWarning?: string
  githubRepository?: GitHubRepositoryAssociation
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
