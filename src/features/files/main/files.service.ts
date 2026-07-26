import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'

import type {
  FilesContext,
  FilesDocument,
  FilesEntry,
  ListFilesDirectoryRequest,
  OpenFilesDocumentRequest,
  SaveFilesDocumentRequest,
  SaveFilesDocumentResult,
  SearchFilesRequest,
  FilesSearchResult,
  FilesObservationEvent
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

type FilesKnowledgeBaseRootProvider = {
  getVerifiedRoot: () => Promise<string>
}

type FilesOperationCoordinator = {
  runExclusive: <T>(operation: () => Promise<T>) => Promise<T>
}

type ProjectSessionWorktree = {
  path: string
  branch: string
  baseRevision: string
}

type FilesResolvedRoot = {
  path: string
  coordinated: boolean
}

export function createFilesService({
  repository,
  worktrees,
  knowledgeBaseRootProvider,
  operations,
  readDirectory,
  openDocument,
  saveDocument,
  search
}: {
  repository: FilesRepository
  worktrees: FilesWorktreeValidator
  knowledgeBaseRootProvider?: FilesKnowledgeBaseRootProvider
  operations?: FilesOperationCoordinator
  readDirectory: (rootPath: string, relativePath: string) => Promise<FilesEntry[]>
  openDocument: (rootPath: string, relativePath: string) => Promise<FilesDocument>
  saveDocument: (
    rootPath: string,
    request: Omit<SaveFilesDocumentRequest, 'context'>
  ) => Promise<SaveFilesDocumentResult>
  search: (
    rootPath: string,
    request: Omit<SearchFilesRequest, 'context' | 'requestId'>,
    options?: { signal?: AbortSignal }
  ) => Promise<FilesSearchResult[]>
}) {
  const activeSearches = new Map<string, AbortController>()

  return {
    async listDirectory(request: ListFilesDirectoryRequest): Promise<FilesEntry[]> {
      const root = await resolveFilesRoot(request.context)
      return readDirectory(root.path, request.relativePath)
    },

    async openDocument(request: OpenFilesDocumentRequest): Promise<FilesDocument> {
      const root = await resolveFilesRoot(request.context)
      return openDocument(root.path, request.relativePath)
    },

    async saveDocument(request: SaveFilesDocumentRequest) {
      const root = await resolveFilesRoot(request.context)
      const write = () =>
        saveDocument(root.path, {
          relativePath: request.relativePath,
          content: request.content,
          expectedRevision: request.expectedRevision
        })
      return root.coordinated && operations ? operations.runExclusive(write) : write()
    },

    async search(request: SearchFilesRequest): Promise<FilesSearchResult[]> {
      const root = await resolveFilesRoot(request.context)
      const searchKey = filesSearchKey(request.context, request.requestId)
      abortContextSearches(request.context)
      const controller = new AbortController()
      activeSearches.set(searchKey, controller)
      try {
        return await search(
          root.path,
          {
            query: request.query,
            includeIgnored: request.includeIgnored,
            ...(request.maxResults === undefined ? {} : { maxResults: request.maxResults })
          },
          { signal: controller.signal }
        )
      } finally {
        if (activeSearches.get(searchKey) === controller) activeSearches.delete(searchKey)
      }
    },

    async cancelSearch(request: Pick<SearchFilesRequest, 'context' | 'requestId'>): Promise<void> {
      const searchKey = filesSearchKey(request.context, request.requestId)
      const controller = activeSearches.get(searchKey)
      if (!controller) return
      controller.abort()
      activeSearches.delete(searchKey)
    },

    async observe(
      context: FilesContext,
      onEvent: (event: Omit<FilesObservationEvent, 'subscriptionId'>) => void
    ): Promise<() => void> {
      const root = await resolveFilesRoot(context)
      const contextKey = filesContextKey(context)
      let watcher: FSWatcher | null = null
      try {
        watcher = watch(root.path, { recursive: true }, (_eventType, filename) => {
          onEvent({ kind: 'changed', contextKey, relativePath: filename?.toString() ?? null })
        })
        watcher.on('error', (error) => {
          onEvent({ kind: 'watch-error', contextKey, relativePath: null, message: error.message })
        })
      } catch (error) {
        onEvent({
          kind: 'watch-error',
          contextKey,
          relativePath: null,
          message: error instanceof Error ? error.message : String(error)
        })
      }
      return () => watcher?.close()
    }
  }

  function abortContextSearches(context: FilesContext): void {
    const contextKey = filesContextKey(context)
    for (const [searchKey, controller] of activeSearches) {
      if (searchKey.startsWith(`${contextKey}:`)) {
        controller.abort()
        activeSearches.delete(searchKey)
      }
    }
  }

  async function resolveFilesRoot(context: FilesContext): Promise<FilesResolvedRoot> {
    if (context.kind === 'knowledge-base') {
      if (!knowledgeBaseRootProvider) throw new Error('files.knowledgeBaseUnavailable')
      return { path: await knowledgeBaseRootProvider.getVerifiedRoot(), coordinated: true }
    }

    const worktree = await resolveProjectSessionWorktree(context.sessionId)
    return { path: worktree.path, coordinated: false }
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

function filesSearchKey(context: FilesContext, requestId: string): string {
  return `${filesContextKey(context)}:${requestId}`
}

function filesContextKey(context: FilesContext): string {
  return context.kind === 'project-session' ? context.sessionId : context.contextKey
}
