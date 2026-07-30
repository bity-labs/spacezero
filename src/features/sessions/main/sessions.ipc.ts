import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createManagedProjectAgentSession } from '../../agent-workspace/main/agent-session-handler'
import { getDisabledGlobalSkillPaths } from '../../agent-workspace/main/agent-skill-settings.service'
import { resolveAgentSkillPaths } from '../../agent-workspace/main/agent-skill-paths'
import {
  createProjectSessionRequestSchema,
  renameSessionTitleRequestSchema,
  resumeProjectChatContextRequestSchema
} from '../shared'
import { createSessionsRepository } from './sessions.repository'
import { getManagedWorktreeService } from './managed-worktree.runtime'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { getGlobalChatService } from './global-chat.runtime'
import { getProjectSessionChatService } from './project-session-chat.runtime'
import { getSessionCleanupService } from './session-cleanup.runtime'
import { createSessionsService } from './sessions.service'

const sessionIdRequestSchema = z.object({ sessionId: z.string().trim().min(1) })

const sessionsRepository = createSessionsRepository()
const sessionsService = createSessionsService({ repository: sessionsRepository })

export function registerSessionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.sessions.listProjectSessions, () =>
    sessionsService.listProjectSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.getCurrentGlobalChatContext, () =>
    getGlobalChatService().getOrCreateCurrentChatContext()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.createProjectSession, async (_event, input: unknown) => {
    const request = createProjectSessionRequestSchema.parse(input)
    const { session } = await createManagedProjectAgentSession(request, {
      repository: sessionsRepository,
      utilityHost: getAgentUtilityProcessHost(),
      worktrees: getManagedWorktreeService(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
    return session
  })
  ipcMain.handle(
    IPC_CHANNELS.sessions.getCurrentProjectChatContext,
    async (_event, input: unknown) => {
      const { sessionId } = sessionIdRequestSchema.parse(input)
      return getProjectSessionChatService().getOrCreateCurrentChatContext(sessionId)
    }
  )
  ipcMain.handle(IPC_CHANNELS.sessions.listProjectChatHistory, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    return getProjectSessionChatService().listChatHistory(sessionId)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.resumeProjectChat, async (_event, input: unknown) => {
    const { sessionId, chatContextId } = resumeProjectChatContextRequestSchema.parse(input)
    return getProjectSessionChatService().resumeChatContext(sessionId, chatContextId)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.clearProjectChat, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    return getProjectSessionChatService().clearChat(sessionId)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.rename, async (_event, input: unknown) => {
    const { sessionId, title } = renameSessionTitleRequestSchema.parse(input)
    return sessionsService.renameSession(sessionId, title)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.archive, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await getSessionCleanupService().archiveSession(sessionId)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.delete, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await getSessionCleanupService().deleteSession(sessionId)
  })
}
