import { ipcMain } from 'electron'

import {
  FILES_IPC_CHANNELS,
  listFilesDirectoryRequestSchema,
  openFilesDocumentRequestSchema,
  saveFilesDocumentRequestSchema,
  searchFilesRequestSchema,
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

export function createSearchFilesHandler(
  service: Pick<FilesAPI, 'search'>
): (input: unknown) => ReturnType<FilesAPI['search']> {
  return async (input) => service.search(searchFilesRequestSchema.parse(input))
}

export function registerFilesIpc(): void {
  const handleListDirectory = createListFilesDirectoryHandler(filesService)
  const handleOpenDocument = createOpenFilesDocumentHandler(filesService)
  const handleSaveDocument = createSaveFilesDocumentHandler(filesService)
  const handleSearch = createSearchFilesHandler(filesService)
  ipcMain.handle(FILES_IPC_CHANNELS.listDirectory, (_event, input: unknown) =>
    handleListDirectory(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.openDocument, (_event, input: unknown) =>
    handleOpenDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.saveDocument, (_event, input: unknown) =>
    handleSaveDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.search, (_event, input: unknown) => handleSearch(input))
}
