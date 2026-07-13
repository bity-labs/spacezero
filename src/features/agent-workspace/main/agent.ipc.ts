import { ipcMain } from 'electron'
import { z } from 'zod'

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { createProjectAgentSession } from './agent-session-handler'
import { getAgentUtilityProcessHost } from './agent-utility-process'

const PING_SESSION_ID = 'agent-ping'

const getStateRequestSchema = z.object({
  sessionId: z.string().trim().min(1)
})

export function registerAgentIpc(): void {
  ipcMain.handle(IPC_CHANNELS.agent.ping, () => {
    return getAgentUtilityProcessHost().ping({ sessionId: PING_SESSION_ID })
  })

  ipcMain.handle(IPC_CHANNELS.agent.createSession, (_event, input) => {
    return createProjectAgentSession(input, {
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost()
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.getState, (_event, input) => {
    const request = getStateRequestSchema.parse(input)
    return getAgentUtilityProcessHost().getState(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.listSessions, () => {
    return getAgentUtilityProcessHost().listSessions()
  })
}
