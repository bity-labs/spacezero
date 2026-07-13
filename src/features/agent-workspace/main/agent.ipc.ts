import { ipcMain } from 'electron'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { getAgentUtilityProcessHost } from './agent-utility-process'

const PING_SESSION_ID = 'agent-ping'

const createSessionRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  cwd: z.string().trim().min(1)
})

const getStateRequestSchema = z.object({
  sessionId: z.string().trim().min(1)
})

export function registerAgentIpc(): void {
  ipcMain.handle(IPC_CHANNELS.agent.ping, () => {
    return getAgentUtilityProcessHost().ping({ sessionId: PING_SESSION_ID })
  })

  ipcMain.handle(IPC_CHANNELS.agent.createSession, async (_event, input) => {
    const request = createSessionRequestSchema.parse(input)
    const repository = createSessionsRepository()
    if (!(await repository.projectExists(request.projectId))) throw new Error('Project not found')

    const sessionId = nanoid()
    const state = await getAgentUtilityProcessHost().createSession({
      sessionId,
      projectId: request.projectId,
      cwd: request.cwd
    })

    await createSessionsService({ repository }).createProjectAgentSession({
      id: sessionId,
      projectId: request.projectId,
      transcriptPath: state.transcriptPath
    })

    return state
  })

  ipcMain.handle(IPC_CHANNELS.agent.getState, (_event, input) => {
    const request = getStateRequestSchema.parse(input)
    return getAgentUtilityProcessHost().getState(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.listSessions, () => {
    return getAgentUtilityProcessHost().listSessions()
  })
}
