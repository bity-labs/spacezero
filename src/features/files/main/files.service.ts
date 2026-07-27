import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve, sep, win32 } from 'node:path'

import type {
  CreateFilesEntryRequest,
  FilesContext,
  FilesDocument,
  FilesEntry,
  FilesObservationEvent,
  FilesSearchResult,
  ListFilesDirectoryRequest,
  MoveFilesEntryRequest,
  OpenFilesDocumentRequest,
  RevealFilesEntryRequest,
  SaveFilesDocumentRequest,
  SaveFilesDocumentResult,
  SearchFilesRequest,
  TrashFilesEntryRequest
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
  createEntry,
  moveEntry,
  trashEntry,
  revealEntry,
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
  createEntry: (
    rootPath: string,
    request: Omit<CreateFilesEntryRequest, 'context'>
  ) => Promise<void>
  moveEntry: (rootPath: string, request: Omit<MoveFilesEntryRequest, 'context'>) => Promise<void>
  trashEntry: (rootPath: string, request: Omit<TrashFilesEntryRequest, 'context'>) => Promise<void>
  revealEntry: (rootPath: string, relativePath: string) => Promise<void>
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

    async createEntry(request: CreateFilesEntryRequest): Promise<void> {
      const root = await resolveFilesRoot(request.context)
      const write = () =>
        createEntry(root.path, { relativePath: request.relativePath, kind: request.kind })
      return root.coordinated && operations ? operations.runExclusive(write) : write()
    },

    async moveEntry(request: MoveFilesEntryRequest): Promise<void> {
      const root = await resolveFilesRoot(request.context)
      const write = () =>
        moveEntry(root.path, {
          sourcePath: request.sourcePath,
          destinationPath: request.destinationPath
        })
      return root.coordinated && operations ? operations.runExclusive(write) : write()
    },

    async trashEntry(request: TrashFilesEntryRequest): Promise<void> {
      const root = await resolveFilesRoot(request.context)
      const write = () => trashEntry(root.path, { relativePath: request.relativePath })
      return root.coordinated && operations ? operations.runExclusive(write) : write()
    },

    async revealInSystemFileManager(request: RevealFilesEntryRequest): Promise<void> {
      const root = await resolveFilesRoot(request.context)
      return revealEntry(root.path, request.relativePath)
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
      const pendingEvents = new Map<string, NodeJS.Timeout>()
      const emitChangedPath = (eventType: string, filename: string | Buffer | null): void => {
        const relativePath = normalizeWatchedRelativePath(filename?.toString() ?? null)
        if (relativePath === 'protected') return
        const key = `${eventType}:${relativePath ?? ''}`
        const previous = pendingEvents.get(key)
        if (previous) clearTimeout(previous)
        pendingEvents.set(
          key,
          setTimeout(() => {
            pendingEvents.delete(key)
            void classifyWatchedEvent(root.path, eventType, relativePath)
              .then((kind) => onEvent({ kind, contextKey, relativePath }))
              .catch((error) => {
                onEvent({
                  kind: 'watch-error',
                  contextKey,
                  relativePath,
                  message: error instanceof Error ? error.message : String(error)
                })
              })
          }, 50)
        )
      }
      try {
        watcher = watch(root.path, { recursive: true }, emitChangedPath)
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
      return () => {
        for (const timeout of pendingEvents.values()) clearTimeout(timeout)
        pendingEvents.clear()
        watcher?.close()
      }
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

function normalizeWatchedRelativePath(filename: string | null): string | null | 'protected' {
  if (!filename) return null
  const normalized = normalize(filename).split(sep).join('/')
  if (normalized.split('/').some((segment) => segment.toLowerCase() === '.git')) {
    return 'protected'
  }
  if (
    !normalized ||
    normalized === '.' ||
    normalized.includes('\0') ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    isAbsolute(normalized) ||
    win32.isAbsolute(normalized) ||
    /^[a-z]:/i.test(normalized)
  ) {
    return null
  }
  return normalized
}

async function classifyWatchedEvent(
  rootPath: string,
  eventType: string,
  relativePath: string | null
): Promise<'created' | 'modified' | 'deleted'> {
  if (!relativePath) return 'modified'
  try {
    await lstat(resolve(rootPath, relativePath))
    return eventType === 'rename' ? 'created' : 'modified'
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 'deleted'
    throw error
  }
}
