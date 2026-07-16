import { ipcMain } from 'electron'
import { rm } from 'node:fs/promises'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createProjectSessionRequestSchema } from '../shared'
import { createSessionsRepository } from './sessions.repository'
import { getAgentUtilityProcessHost } from '../../agent-workspace/main/agent-utility-process'
import { createSessionsService } from './sessions.service'

const sessionIdRequestSchema = z.object({ sessionId: z.string().trim().min(1) })

const sessionsService = createSessionsService({
  repository: createSessionsRepository()
})

export function registerSessionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.sessions.listProjectSessions, () =>
    sessionsService.listProjectSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.listWorkspaceSessions, () =>
    sessionsService.listWorkspaceSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.createProjectSession, (_event, request: unknown) =>
    sessionsService.createProjectSession(createProjectSessionRequestSchema.parse(request))
  )
  ipcMain.handle(IPC_CHANNELS.sessions.archive, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    await sessionsService.archiveSession(sessionId)
    await getAgentUtilityProcessHost().deleteSession({ sessionId }).catch(() => undefined)
  })
  ipcMain.handle(IPC_CHANNELS.sessions.delete, async (_event, input: unknown) => {
    const { sessionId } = sessionIdRequestSchema.parse(input)
    const session = await sessionsService.deleteSession(sessionId)
    await getAgentUtilityProcessHost().deleteSession({ sessionId }).catch(() => undefined)
    if (session.transcriptPath) await rm(session.transcriptPath, { force: true }).catch(() => undefined)
  })
}
