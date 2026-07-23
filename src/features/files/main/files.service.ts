import type { FilesEntry, ListFilesDirectoryRequest } from '../shared'

export type FilesRepository = {
  findSessionById: (sessionId: string) => Promise<
    | {
        id: string
        projectId: string | null
        worktreePath?: string | null
        worktreeBranch?: string | null
        worktreeBaseRevision?: string | null
        archivedAt?: Date | null
      }
    | undefined
  >
  findProjectById: (
    projectId: string
  ) => Promise<{ id: string; path: string; archivedAt?: Date | null } | undefined>
}

export type FilesWorktreeValidator = {
  validate: (request: {
    projectPath: string
    projectId: string
    sessionId: string
    worktree: { path: string; branch: string; baseRevision: string }
  }) => Promise<boolean>
}

export function createFilesService({
  repository,
  worktrees,
  readDirectory
}: {
  repository: FilesRepository
  worktrees: FilesWorktreeValidator
  readDirectory: (rootPath: string, relativePath: string) => Promise<FilesEntry[]>
}) {
  return {
    async listDirectory(request: ListFilesDirectoryRequest): Promise<FilesEntry[]> {
      const session = await repository.findSessionById(request.sessionId)
      if (!session?.projectId || session.archivedAt) {
        throw new Error('files.projectSessionNotFound')
      }
      if (!session.worktreePath || !session.worktreeBranch || !session.worktreeBaseRevision) {
        throw new Error('files.worktreeMissing')
      }
      const project = await repository.findProjectById(session.projectId)
      if (!project || project.archivedAt) throw new Error('files.projectNotFound')
      const worktree = {
        path: session.worktreePath,
        branch: session.worktreeBranch,
        baseRevision: session.worktreeBaseRevision
      }
      const valid = await worktrees.validate({
        projectPath: project.path,
        projectId: session.projectId,
        sessionId: session.id,
        worktree
      })
      if (!valid) throw new Error('files.worktreeInvalid')
      return readDirectory(worktree.path, request.relativePath)
    }
  }
}
