import { ipcMain, shell } from 'electron'

import {
  FILES_IPC_CHANNELS,
  listFilesDirectoryRequestSchema,
  openFilesDocumentRequestSchema,
  revealFilesEntryRequestSchema,
  saveFilesDocumentRequestSchema,
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
import { revealFilesEntry } from './files-reveal.adapter'
import { createFilesService } from './files.service'

const filesService = createFilesService({
  repository: createSessionsRepository(),
  worktrees: getManagedWorktreeService(),
  knowledgeBaseRootProvider: getKnowledgeBaseRootProvider(),
  operations: getKnowledgeBaseOperationCoordinator(),
  readDirectory: readFilesDirectory,
  openDocument: openFilesDocument,
  saveDocument: saveFilesDocument,
  revealEntry: (rootPath, relativePath) =>
    revealFilesEntry(rootPath, relativePath, { revealInFolder: shell.showItemInFolder })
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

export function createRevealFilesEntryHandler(
  service: Pick<FilesAPI, 'revealInSystemFileManager'>
): (input: unknown) => ReturnType<FilesAPI['revealInSystemFileManager']> {
  return async (input) =>
    service.revealInSystemFileManager(revealFilesEntryRequestSchema.parse(input))
}

export function registerFilesIpc(): void {
  const handleListDirectory = createListFilesDirectoryHandler(filesService)
  const handleOpenDocument = createOpenFilesDocumentHandler(filesService)
  const handleSaveDocument = createSaveFilesDocumentHandler(filesService)
  const handleRevealEntry = createRevealFilesEntryHandler(filesService)
  ipcMain.handle(FILES_IPC_CHANNELS.listDirectory, (_event, input: unknown) =>
    handleListDirectory(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.openDocument, (_event, input: unknown) =>
    handleOpenDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.saveDocument, (_event, input: unknown) =>
    handleSaveDocument(input)
  )
  ipcMain.handle(FILES_IPC_CHANNELS.revealInSystemFileManager, (_event, input: unknown) =>
    handleRevealEntry(input)
  )
}
