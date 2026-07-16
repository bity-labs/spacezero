import { ipcMain } from 'electron'

import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  cloneKnowledgeBaseRequestSchema
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
}
