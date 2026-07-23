import type {
  FilesDocument,
  FilesEntry,
  ListFilesDirectoryRequest,
  OpenFilesDocumentRequest,
  SaveFilesDocumentRequest,
  SaveFilesDocumentResult
} from '../shared'

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

type ProjectSessionWorktree = {
  path: string
  branch: string
  baseRevision: string
}

export function createFilesService({
  repository,
  worktrees,
  readDirectory,
  openDocument,
  saveDocument
}: {
  repository: FilesRepository
  worktrees: FilesWorktreeValidator
  readDirectory: (rootPath: string, relativePath: string) => Promise<FilesEntry[]>
  openDocument: (rootPath: string, relativePath: string) => Promise<FilesDocument>
  saveDocument: (
    rootPath: string,
    request: Omit<SaveFilesDocumentRequest, 'sessionId'>
  ) => Promise<SaveFilesDocumentResult>
}) {
  return {
    async listDirectory(request: ListFilesDirectoryRequest): Promise<FilesEntry[]> {
      const worktree = await resolveProjectSessionWorktree(request.sessionId)
      return readDirectory(worktree.path, request.relativePath)
    },

    async openDocument(request: OpenFilesDocumentRequest): Promise<FilesDocument> {
      const worktree = await resolveProjectSessionWorktree(request.sessionId)
      return openDocument(worktree.path, request.relativePath)
    },

    async saveDocument(request: SaveFilesDocumentRequest & { sessionId: string }) {
      const worktree = await resolveProjectSessionWorktree(request.sessionId)
      return saveDocument(worktree.path, {
        relativePath: request.relativePath,
        content: request.content,
        expectedRevision: request.expectedRevision
      })
    }
  }

  async function resolveProjectSessionWorktree(sessionId: string): Promise<ProjectSessionWorktree> {
    const session = await repository.findSessionById(sessionId)
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
    return worktree
  }
}
