import { ipcMain, shell } from 'electron'

import {
  FILES_IPC_CHANNELS,
  cancelFilesSearchRequestSchema,
  createFilesEntryRequestSchema,
  listFilesDirectoryRequestSchema,
  moveFilesEntryRequestSchema,
  observeFilesRequestSchema,
  openFilesDocumentRequestSchema,
  revealFilesEntryRequestSchema,
  saveFilesDocumentRequestSchema,
  searchFilesRequestSchema,
  trashFilesEntryRequestSchema,
  unobserveFilesRequestSchema,
  type FilesAPI
} from '../shared'
import {
  getKnowledgeBaseOperationCoordinator,
  getKnowledgeBaseRootProvider
} from '../../knowledge-base/main'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { readFilesDirectory } from './files-directory.adapter'
import { openFilesDocument, saveFilesDocument } from './files-document.adapter'
import { createFilesEntry, moveFilesEntry, trashFilesEntry } from './files-operations.adapter'
import { revealFilesEntry } from './files-reveal.adapter'
import { searchFiles } from './files-search.adapter'
import { createFilesService } from './files.service'

const filesService = createFilesService({
  repository: createSessionsRepository(),
  worktrees: getManagedWorktreeService(),
  knowledgeBaseRootProvider: getKnowledgeBaseRootProvider(),
  operations: getKnowledgeBaseOperationCoordinator(),
  readDirectory: readFilesDirectory,
  openDocument: openFilesDocument,
  saveDocument: saveFilesDocument,
  createEntry: createFilesEntry,
  moveEntry: moveFilesEntry,
  trashEntry: (rootPath, request) =>
    trashFilesEntry(rootPath, request, { trashItem: (path) => shell.trashItem(path) }),
  revealEntry: (rootPath, relativePath) =>
    revealFilesEntry(rootPath, relativePath, { revealInFolder: shell.showItemInFolder }),
  search: searchFiles
})

export function createListFilesDirectoryHandler(
  service: Pick<FilesAPI, 'listDirectory'>
): (input: unknown) => ReturnType<FilesAPI['listDirectory']> {
  return async (input) => service.listDirectory(listFilesDirectoryRequestSchema.parse(input))
}

export function createOpenFilesDocumentHandler(
  service: Pick<FilesAPI, 'openDocument'>
): (input: unknown) => ReturnType<FilesAPI['openDocument']> {
  return async (input) => service.openDocument(openFilesDocumentRequestSchema.parse(input))
}

export function createSaveFilesDocumentHandler(
  service: Pick<FilesAPI, 'saveDocument'>
): (input: unknown) => ReturnType<FilesAPI['saveDocument']> {
  return async (input) => service.saveDocument(saveFilesDocumentRequestSchema.parse(input))
}

export function createCreateFilesEntryHandler(
  service: Pick<FilesAPI, 'createEntry'>
): (input: unknown) => ReturnType<FilesAPI['createEntry']> {
  return async (input) => service.createEntry(createFilesEntryRequestSchema.parse(input))
}

export function createMoveFilesEntryHandler(
  service: Pick<FilesAPI, 'moveEntry'>
): (input: unknown) => ReturnType<FilesAPI['moveEntry']> {
  return async (input) => service.moveEntry(moveFilesEntryRequestSchema.parse(input))
}

export function createTrashFilesEntryHandler(
  service: Pick<FilesAPI, 'trashEntry'>
): (input: unknown) => ReturnType<FilesAPI['trashEntry']> {
  return async (input) => service.trashEntry(trashFilesEntryRequestSchema.parse(input))
}

export function createRevealFilesEntryHandler(
  service: Pick<FilesAPI, 'revealInSystemFileManager'>
): (input: unknown) => ReturnType<FilesAPI['revealInSystemFileManager']> {
  return async (input) =>
    service.revealInSystemFileManager(revealFilesEntryRequestSchema.parse(input))
}

export function createSearchFilesHandler(
  service: Pick<FilesAPI, 'search'>
): (input: unknown) => ReturnType<FilesAPI['search']> {
  return async (input) => service.search(searchFilesRequestSchema.parse(input))
}

export function createCancelFilesSearchHandler(
  service: Pick<FilesAPI, 'cancelSearch'>
): (input: unknown) => ReturnType<FilesAPI['cancelSearch']> {
  return async (input) => service.cancelSearch(cancelFilesSearchRequestSchema.parse(input))
}

export function registerFilesIpc(): void {
  const handleListDirectory = createListFilesDirectoryHandler(filesService)
  const handleOpenDocument = createOpenFilesDocumentHandler(filesService)
  const handleSaveDocument = createSaveFilesDocumentHandler(filesService)
  const handleCreateEntry = createCreateFilesEntryHandler(filesService)
  const handleMoveEntry = createMoveFilesEntryHandler(filesService)
  const handleTrashEntry = createTrashFilesEntryHandler(filesService)
  const handleRevealEntry = createRevealFilesEntryHandler(filesService)
  const handleSearch = createSearchFilesHandler(filesService)
  const handleCancelSearch = createCancelFilesSearchHandler(filesService)
  const observations = new Map<string, () => void>()

  ipcMain.handle(FILES_IPC_CHANNELS.listDirectory, (_event, input: unknown) =>
    handleListDirectory(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.openDocument, (_event, input: unknown) =>
    handleOpenDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.saveDocument, (_event, input: unknown) =>
    handleSaveDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.createEntry, (_event, input: unknown) =>
    handleCreateEntry(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.moveEntry, (_event, input: unknown) => handleMoveEntry(input))
  ipcMain.handle(FILES_IPC_CHANNELS.trashEntry, (_event, input: unknown) => handleTrashEntry(input))
  ipcMain.handle(FILES_IPC_CHANNELS.revealInSystemFileManager, (_event, input: unknown) =>
    handleRevealEntry(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.search, (_event, input: unknown) => handleSearch(input))
  ipcMain.handle(FILES_IPC_CHANNELS.cancelSearch, (_event, input: unknown) =>
    handleCancelSearch(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.observe, async (event, input: unknown) => {
    const request = observeFilesRequestSchema.parse(input)
    const observationKey = `${event.sender.id}:${request.subscriptionId}`
    observations.get(observationKey)?.()
    const close = await filesService.observe(request.context, (payload) => {
      if (event.sender.isDestroyed()) return
      event.sender.send(FILES_IPC_CHANNELS.observationEvent, {
        subscriptionId: request.subscriptionId,
        ...payload
      })
    })
    observations.set(observationKey, close)
    event.sender.once('destroyed', () => {
      observations.get(observationKey)?.()
      observations.delete(observationKey)
    })
    return { subscriptionId: request.subscriptionId }
  })
  ipcMain.handle(FILES_IPC_CHANNELS.unobserve, (event, input: unknown) => {
    const request = unobserveFilesRequestSchema.parse(input)
    const observationKey = `${event.sender.id}:${request.subscriptionId}`
    observations.get(observationKey)?.()
    observations.delete(observationKey)
  })
}
