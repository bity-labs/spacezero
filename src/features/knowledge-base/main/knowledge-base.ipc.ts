import { ipcMain } from 'electron'

import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  cloneKnowledgeBaseRequestSchema,
  createKnowledgeBaseItemRequestSchema,
  knowledgeBasePathRequestSchema,
  moveKnowledgeBaseItemRequestSchema,
  renameKnowledgeBaseItemRequestSchema,
  searchKnowledgeBaseRequestSchema
} from '../shared'
import { getKnowledgeBaseService } from './index'

export function registerKnowledgeBaseIpc(): void {
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getStatus, () =>
    getKnowledgeBaseService().getStatus()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.createNew, () =>
    getKnowledgeBaseService().createNew()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.cloneFromGit, (_event, input: unknown) =>
    getKnowledgeBaseService().cloneFromGit(cloneKnowledgeBaseRequestSchema.parse(input))
  )
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
}
