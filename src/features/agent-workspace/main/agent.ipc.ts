import { ipcMain } from 'electron'
import { z } from 'zod'

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { setAgentModelRequestSchema, setAgentThinkingLevelRequestSchema } from '../../../shared/model-settings'
import { createProjectAgentSession, createWorkspaceAgentSession, restoreAgentSessionState } from './agent-session-handler'
import {
  createGlobalAgentSkillSettingsService,
  getDisabledGlobalSkillPaths
} from './agent-skill-settings.service'
import { resolveAgentSkillPaths } from './agent-skill-paths'
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
  const globalSkillSettings = createGlobalAgentSkillSettingsService({
    listSkills: (skillPaths) => getAgentUtilityProcessHost().listSkills({ skillPaths })
  })

  ipcMain.handle(IPC_CHANNELS.agent.ping, () => {
    return getAgentUtilityProcessHost().ping({ sessionId: PING_SESSION_ID })
  })

  ipcMain.handle(IPC_CHANNELS.agent.createSession, (_event, input) => {
    return createProjectAgentSession(input, {
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.createWorkspaceSession, () => {
    return createWorkspaceAgentSession({
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.getGlobalSkills, () => globalSkillSettings.listGlobalSkills())

  ipcMain.handle(IPC_CHANNELS.agent.setGlobalSkillEnabled, (_event, input) => {
    const request = z.object({
      path: z.string().trim().min(1).max(4096),
      enabled: z.boolean()
    }).parse(input)
    return globalSkillSettings.setGlobalSkillEnabled(request.path, request.enabled)
  })

  ipcMain.handle(IPC_CHANNELS.agent.getState, (_event, input) => {
    return restoreAgentSessionState(input, {
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
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

  ipcMain.handle(IPC_CHANNELS.agent.setModel, async (_event, input) => {
    const request = setAgentModelRequestSchema.parse(input)
    const state = await getAgentUtilityProcessHost().setModel(request)
    await createSessionsService({ repository: createSessionsRepository() }).updateAgentModel(
      request.sessionId,
      request.provider,
      request.modelId
    )
    return state
  })

  ipcMain.handle(IPC_CHANNELS.agent.setThinkingLevel, async (_event, input) => {
    const request = setAgentThinkingLevelRequestSchema.parse(input)
    const state = await getAgentUtilityProcessHost().setThinkingLevel(request)
    await createSessionsService({ repository: createSessionsRepository() }).updateAgentThinkingLevel(
      request.sessionId,
      request.level
    )
    return state
  })
}
