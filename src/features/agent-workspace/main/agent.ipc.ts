import { ipcMain } from 'electron'
import { z } from 'zod'

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { setAgentModelRequestSchema, setAgentThinkingLevelRequestSchema } from '../../../shared/model-settings'
import { createProjectAgentSession } from './agent-session-handler'
import { getAgentUtilityProcessHost } from './agent-utility-process'

const PING_SESSION_ID = 'agent-ping'

const sessionIdRequestSchema = z.object({
  sessionId: z.string().trim().min(1)
})

const promptRequestSchema = sessionIdRequestSchema.extend({
  message: z.string().trim().min(1)
})

const resolveToolConfirmationRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  callId: z.string().trim().min(1),
  approved: z.boolean()
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
    const request = sessionIdRequestSchema.parse(input)
    return getAgentUtilityProcessHost().getState(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.listSessions, () => {
    return getAgentUtilityProcessHost().listSessions()
  })

  ipcMain.handle(IPC_CHANNELS.agent.prompt, (_event, input) => {
    const request = promptRequestSchema.parse(input)
    return getAgentUtilityProcessHost().prompt(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.abort, (_event, input) => {
    const request = sessionIdRequestSchema.parse(input)
    return getAgentUtilityProcessHost().abort(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.resolveToolConfirmation, (_event, input) => {
    const request = resolveToolConfirmationRequestSchema.parse(input)
    return getAgentUtilityProcessHost().resolveToolConfirmation(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.setModel, (_event, input) => {
    const request = setAgentModelRequestSchema.parse(input)
    return getAgentUtilityProcessHost().setModel(request)
  })

  ipcMain.handle(IPC_CHANNELS.agent.setThinkingLevel, (_event, input) => {
    const request = setAgentThinkingLevelRequestSchema.parse(input)
    return getAgentUtilityProcessHost().setThinkingLevel(request)
  })
}
