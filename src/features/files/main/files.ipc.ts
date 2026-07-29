import { ipcMain, shell } from 'electron'

import {
  FILES_IPC_CHANNELS,
  cancelFilesSearchRequestSchema,
  createFilesEntryRequestSchema,
  listFilesDirectoryRequestSchema,
  listFilesTreeRequestSchema,
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
import { readFilesDirectory, readFilesTree } from './files-directory.adapter'
import { openFilesDocument, saveFilesDocument } from './files-document.adapter'
import { createFilesEntry, moveFilesEntry, trashFilesEntry } from './files-operations.adapter'
import { revealFilesEntry } from './files-reveal.adapter'
import { searchFiles } from './files-search.adapter'
import { createFilesService } from './files.service'

type FilesObservationSender = {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, payload: unknown) => void
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
}

type FilesObservationService = {
  observe: (
    context: Parameters<ReturnType<typeof createFilesService>['observe']>[0],
    onEvent: Parameters<ReturnType<typeof createFilesService>['observe']>[1]
  ) => Promise<() => void>
}

type FilesObservationRecord = {
  sender: FilesObservationSender
  close?: () => void
  closed: boolean
  onDestroyed: () => void
}

export function createObserveFilesHandler(
  service: FilesObservationService,
  observations = new Map<string, FilesObservationRecord>()
): (sender: FilesObservationSender, input: unknown) => Promise<{ subscriptionId: string }> {
  return async (sender, input) => {
    const request = observeFilesRequestSchema.parse(input)
    const observationKey = filesObservationKey(sender, request.subscriptionId)
    closeFilesObservation(observations, observationKey)

    const record: FilesObservationRecord = {
      sender,
      closed: false,
      onDestroyed: () => closeFilesObservation(observations, observationKey)
    }
    observations.set(observationKey, record)
    sender.once('destroyed', record.onDestroyed)

    try {
      const close = await service.observe(request.context, (payload) => {
        if (record.closed || observations.get(observationKey) !== record || sender.isDestroyed()) {
          return
        }
        sender.send(FILES_IPC_CHANNELS.observationEvent, {
          subscriptionId: request.subscriptionId,
          ...payload
        })
      })
      if (record.closed || observations.get(observationKey) !== record) {
        close()
        return { subscriptionId: request.subscriptionId }
      }
      record.close = close
      return { subscriptionId: request.subscriptionId }
    } catch (error) {
      if (observations.get(observationKey) === record) {
        observations.delete(observationKey)
        sender.removeListener('destroyed', record.onDestroyed)
      }
      record.closed = true
      throw error
    }
  }
}

export function createUnobserveFilesHandler(
  observations = new Map<string, FilesObservationRecord>()
): (sender: FilesObservationSender, input: unknown) => Promise<void> {
  return async (sender, input) => {
    const request = unobserveFilesRequestSchema.parse(input)
    closeFilesObservation(observations, filesObservationKey(sender, request.subscriptionId))
  }
}

function closeFilesObservation(
  observations: Map<string, FilesObservationRecord>,
  observationKey: string
): void {
  const record = observations.get(observationKey)
  if (!record) return
  observations.delete(observationKey)
  if (!record.closed) {
    record.closed = true
    record.sender.removeListener('destroyed', record.onDestroyed)
    record.close?.()
  }
}

function filesObservationKey(
  sender: Pick<FilesObservationSender, 'id'>,
  subscriptionId: string
): string {
  return `${sender.id}:${subscriptionId}`
}

const filesService = createFilesService({
  repository: createSessionsRepository(),
  worktrees: getManagedWorktreeService(),
  knowledgeBaseRootProvider: getKnowledgeBaseRootProvider(),
  operations: getKnowledgeBaseOperationCoordinator(),
  readDirectory: readFilesDirectory,
  readTree: readFilesTree,
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

export function createListFilesTreeHandler(
  service: Pick<FilesAPI, 'listTree'>
): (input: unknown) => ReturnType<FilesAPI['listTree']> {
  return async (input) => service.listTree(listFilesTreeRequestSchema.parse(input))
}

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
  const handleListTree = createListFilesTreeHandler(filesService)
  const handleListDirectory = createListFilesDirectoryHandler(filesService)
  const handleOpenDocument = createOpenFilesDocumentHandler(filesService)
  const handleSaveDocument = createSaveFilesDocumentHandler(filesService)
  const handleCreateEntry = createCreateFilesEntryHandler(filesService)
  const handleMoveEntry = createMoveFilesEntryHandler(filesService)
  const handleTrashEntry = createTrashFilesEntryHandler(filesService)
  const handleRevealEntry = createRevealFilesEntryHandler(filesService)
  const handleSearch = createSearchFilesHandler(filesService)
  const handleCancelSearch = createCancelFilesSearchHandler(filesService)
  const observations = new Map<string, FilesObservationRecord>()

  ipcMain.handle(FILES_IPC_CHANNELS.listTree, (_event, input: unknown) => handleListTree(input))
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
  const handleObserve = createObserveFilesHandler(filesService, observations)
  const handleUnobserve = createUnobserveFilesHandler(observations)
  ipcMain.handle(FILES_IPC_CHANNELS.observe, (event, input: unknown) =>
    handleObserve(event.sender, input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.unobserve, (event, input: unknown) =>
    handleUnobserve(event.sender, input)
  )
}
