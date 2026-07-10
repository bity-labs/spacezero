import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createProjectSessionRequestSchema } from '../shared'
import { createSessionsRepository } from './sessions.repository'
import { createSessionsService } from './sessions.service'

const sessionsService = createSessionsService({
  repository: createSessionsRepository()
})

export function registerSessionsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.sessions.listProjectSessions, () =>
    sessionsService.listProjectSessions()
  )
  ipcMain.handle(IPC_CHANNELS.sessions.createProjectSession, (_event, request: unknown) =>
    sessionsService.createProjectSession(createProjectSessionRequestSchema.parse(request))
  )
}
