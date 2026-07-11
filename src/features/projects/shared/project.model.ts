export type Project = {
  id: string
  name: string
  path: string
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
