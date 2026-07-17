let pendingProjectId: string | null = null

export function requestProjectOpen(projectId: string): void {
  pendingProjectId = projectId
}

export function consumeProjectOpenRequest(): string | null {
  const projectId = pendingProjectId
  pendingProjectId = null
  return projectId
}
