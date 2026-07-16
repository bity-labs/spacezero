import { ipcMain } from 'electron'

import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  addKnowledgeBaseRemoteRequestSchema,
  checkKnowledgeBaseDocumentRequestSchema,
  cloneKnowledgeBaseRequestSchema,
  createKnowledgeBaseItemRequestSchema,
  knowledgeBasePathRequestSchema,
  moveKnowledgeBaseItemRequestSchema,
  renameKnowledgeBaseItemRequestSchema,
  saveKnowledgeBaseDocumentRequestSchema,
  searchKnowledgeBaseRequestSchema
} from '../shared'
import {
  getKnowledgeBaseProjectsService,
  getKnowledgeBaseService,
  getKnowledgeBaseSyncCoordinator
} from './index'

export function registerKnowledgeBaseIpc(): void {
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getStatus, () =>
    getKnowledgeBaseService().getStatus()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.createNew, async () => {
    const status = await getKnowledgeBaseService().createNew()
    await getKnowledgeBaseProjectsService().linkExistingProjects()
    return status
  })
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.cloneFromGit, async (_event, input: unknown) => {
    const status = await getKnowledgeBaseService().cloneFromGit(
      cloneKnowledgeBaseRequestSchema.parse(input)
    )
    await getKnowledgeBaseProjectsService().linkExistingProjects()
    return status
  })
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getTree, () =>
    getKnowledgeBaseService().getTree()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.openDocument, (_event, input: unknown) =>
    getKnowledgeBaseService().openDocument(knowledgeBasePathRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.search, (_event, input: unknown) =>
    getKnowledgeBaseService().search(searchKnowledgeBaseRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.createItem, (_event, input: unknown) =>
    getKnowledgeBaseService().createItem(createKnowledgeBaseItemRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.renameItem, (_event, input: unknown) =>
    getKnowledgeBaseService().renameItem(renameKnowledgeBaseItemRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.moveItem, (_event, input: unknown) =>
    getKnowledgeBaseService().moveItem(moveKnowledgeBaseItemRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.deleteItem, (_event, input: unknown) =>
    getKnowledgeBaseService().deleteItem(knowledgeBasePathRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.saveDocument, (_event, input: unknown) =>
    getKnowledgeBaseService().saveDocument(saveKnowledgeBaseDocumentRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.checkDocument, (_event, input: unknown) =>
    getKnowledgeBaseService().checkDocument(checkKnowledgeBaseDocumentRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getSyncStatus, () =>
    getKnowledgeBaseService().getSyncStatus()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.addRemote, (_event, input: unknown) =>
    getKnowledgeBaseService().addRemote(addKnowledgeBaseRemoteRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.syncNow, () =>
    getKnowledgeBaseSyncCoordinator().sync()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.openFolder, () =>
    getKnowledgeBaseService().openFolder()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.openRemote, () =>
    getKnowledgeBaseService().openRemote()
  )
}
