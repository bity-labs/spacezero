import { ipcMain } from 'electron'

import { shouldProceedWithLiveTerminalTermination } from '../../terminal/main/terminal-confirmation.service'
import { getTerminalService } from '../../terminal/main/terminal.runtime'

import {
  KNOWLEDGE_BASE_IPC_CHANNELS,
  addKnowledgeBaseRemoteRequestSchema,
  checkKnowledgeBaseDocumentRequestSchema,
  cloneKnowledgeBaseRequestSchema,
  createKnowledgeBaseItemRequestSchema,
  importKnowledgeBaseImageRequestSchema,
  knowledgeBasePathRequestSchema,
  loadKnowledgeBaseImageRequestSchema,
  moveKnowledgeBaseItemRequestSchema,
  renameKnowledgeBaseItemRequestSchema,
  saveKnowledgeBaseDocumentRequestSchema,
  searchKnowledgeBaseRequestSchema
} from '../shared'
import { getKnowledgeBaseChatService } from './knowledge-base-chat.runtime'
import {
  getKnowledgeBaseProjectsService,
  getKnowledgeBaseService,
  getKnowledgeBaseSyncCoordinator
} from './index'

export function registerKnowledgeBaseIpc(): void {
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getStatus, () => getKnowledgeBaseService().getStatus())
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getCurrentSession, () =>
    getKnowledgeBaseChatService().getOrCreateCurrentSession()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.startNewChat, () =>
    getKnowledgeBaseChatService().startNewChat()
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.reset, async () => {
    const terminalService = getTerminalService()
    const context = { kind: 'knowledge-base' as const }
    const confirmed = await shouldProceedWithLiveTerminalTermination({
      count: terminalService.countLiveTerminalsForContext(context),
      purpose: 'delete-context'
    })
    if (!confirmed) throw new Error('terminal.confirmationCancelled')
    await terminalService.closeAllForContext(context)
    await getKnowledgeBaseProjectsService().clearProjectLinks()
    return getKnowledgeBaseService().reset()
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
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.getTree, () => getKnowledgeBaseService().getTree())
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.openDocument, (_event, input: unknown) =>
    getKnowledgeBaseService().openDocument(knowledgeBasePathRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.search, (_event, input: unknown) =>
    getKnowledgeBaseService().search(searchKnowledgeBaseRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.importImage, (_event, input: unknown) =>
    getKnowledgeBaseService().importImage(importKnowledgeBaseImageRequestSchema.parse(input))
  )
  ipcMain.handle(KNOWLEDGE_BASE_IPC_CHANNELS.loadImage, (_event, input: unknown) =>
    getKnowledgeBaseService().loadImage(loadKnowledgeBaseImageRequestSchema.parse(input))
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
