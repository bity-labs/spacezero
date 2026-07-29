import { ipcMain } from 'electron'

import { runWithLiveTerminalConfirmation } from '../../terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../../terminal/main/terminal.runtime'

import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  cloneKnowledgeBaseRequestSchema,
  importKnowledgeBaseImageRequestSchema,
  loadKnowledgeBaseImageRequestSchema
} from '../shared'
import { getKnowledgeBaseChatService } from './knowledge-base-chat.runtime'
import { getKnowledgeBaseProjectsService, getKnowledgeBaseService } from './index'

export function registerKnowledgeBaseIpc(): void {
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getStatus, () => getKnowledgeBaseService().getStatus())
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getCurrentChatContext, () =>
    getKnowledgeBaseChatService().getOrCreateCurrentChatContext()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.clearChat, () =>
    getKnowledgeBaseChatService().clearChat()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.reset, async () => {
    const terminalService = getTerminalService()
    const context = { kind: 'knowledge-base' as const }
    return runWithLiveTerminalConfirmation({
      operationKey: 'reset-knowledge-base',
      purpose: 'delete-context',
      countLiveTerminals: () => terminalService.countLiveTerminalsForContext(context),
      run: async () => {
        await terminalService.closeAllForContext(context)
        await getKnowledgeBaseProjectsService().clearProjectLinks()
        return getKnowledgeBaseService().reset()
      }
    })
  })
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.createNew, async () => {
    const status = await getKnowledgeBaseService().createNew()
    const links = await getKnowledgeBaseProjectsService().linkExistingProjects()
    return links.warning ? { ...status, setupWarning: links.warning } : status
  })
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.cloneFromGit, async (_event, input: unknown) => {
    const status = await getKnowledgeBaseService().cloneFromGit(
      cloneKnowledgeBaseRequestSchema.parse(input)
    )
    const links = await getKnowledgeBaseProjectsService().linkExistingProjects()
    return links.warning ? { ...status, setupWarning: links.warning } : status
  })
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.importImage, (_event, input: unknown) =>
    getKnowledgeBaseService().importImage(importKnowledgeBaseImageRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.loadImage, (_event, input: unknown) =>
    getKnowledgeBaseService().loadImage(loadKnowledgeBaseImageRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.openFolder, () =>
    getKnowledgeBaseService().openFolder()
  )
}
