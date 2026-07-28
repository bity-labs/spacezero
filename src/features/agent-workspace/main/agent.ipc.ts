import { ipcMain } from 'electron'
import { z } from 'zod'

import {
  getKnowledgeBaseMentionsService,
  getKnowledgeBaseRootProvider,
  getKnowledgeBaseService
} from '../../knowledge-base/main'
import { resolveProjectRepositoryPath } from '../../projects/main/project-repository-path'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { createSessionsService } from '../../sessions/main/sessions.service'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { IPC_CHANNELS } from '../../../shared/ipc'
import {
  setAgentModelRequestSchema,
  setAgentThinkingLevelRequestSchema
} from '../../../shared/model-settings'
import {
  applyAgentDefinitionToFreshSession,
  createProjectAgentSession,
  createWorkspaceAgentSession,
  restoreAgentSessionState
} from './agent-session-handler'
import {
  createGlobalAgentSkillSettingsService,
  getDisabledGlobalSkillPaths
} from './agent-skill-settings.service'
import { resolveAgentSkillPaths } from './agent-skill-paths'
import { getAgentUtilityProcessHost } from './agent-utility-process'

const PING_SESSION_ID = 'agent-ping'

const agentDefinitionReferenceSchema = z.object({
  id: z.string().trim().min(1)
})

const sessionIdRequestSchema = z.object({
  sessionId: z.string().trim().min(1)
})

const createWorkspaceSessionRequestSchema = z
  .object({
    agentDefinition: agentDefinitionReferenceSchema.optional()
  })
  .optional()

const promptRequestSchema = sessionIdRequestSchema.extend({
  message: z.string().trim().min(1)
})

const resolveToolConfirmationRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  callId: z.string().trim().min(1),
  approved: z.boolean()
})

async function getVerifiedKnowledgeBaseStatus() {
  const status = await getKnowledgeBaseService().getStatus()
  if (status.setupState !== 'configured') return status

  return {
    ...status,
    rootPath: await getKnowledgeBaseRootProvider().getVerifiedRoot()
  }
}

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
      worktrees: getManagedWorktreeService(),
      resolveProjectPathForSession: resolveProjectRepositoryPath,
      getKnowledgeBaseStatus: getVerifiedKnowledgeBaseStatus,
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.createWorkspaceSession, (_event, input) => {
    const request = createWorkspaceSessionRequestSchema.parse(input)
    return createWorkspaceAgentSession({
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths,
      ...(request?.agentDefinition ? { agentDefinition: request.agentDefinition } : {})
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.applyDefinitionToFreshSession, (_event, input) => {
    return applyAgentDefinitionToFreshSession(input, {
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      worktrees: getManagedWorktreeService(),
      getKnowledgeBaseStatus: getVerifiedKnowledgeBaseStatus,
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.getGlobalSkills, () => globalSkillSettings.listGlobalSkills())

  ipcMain.handle(IPC_CHANNELS.agent.setGlobalSkillEnabled, (_event, input) => {
    const request = z
      .object({
        path: z.string().trim().min(1).max(4096),
        enabled: z.boolean()
      })
      .parse(input)
    return globalSkillSettings.setGlobalSkillEnabled(request.path, request.enabled)
  })

  ipcMain.handle(IPC_CHANNELS.agent.getState, (_event, input) => {
    return restoreAgentSessionState(input, {
      repository: createSessionsRepository(),
      utilityHost: getAgentUtilityProcessHost(),
      worktrees: getManagedWorktreeService(),
      getKnowledgeBaseStatus: getVerifiedKnowledgeBaseStatus,
      readDisabledGlobalSkillPaths: getDisabledGlobalSkillPaths,
      resolveSkillPaths: resolveAgentSkillPaths
    })
  })

  ipcMain.handle(IPC_CHANNELS.agent.listSessions, () => {
    return getAgentUtilityProcessHost().listSessions()
  })

  ipcMain.handle(IPC_CHANNELS.agent.prompt, async (_event, input) => {
    const request = promptRequestSchema.parse(input)
    const prompt = await getKnowledgeBaseMentionsService().addPromptHints(request.message)
    return getAgentUtilityProcessHost().prompt({ ...request, ...prompt })
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
      state.sessionId,
      state.modelProvider ?? request.provider,
      state.modelId ?? request.modelId,
      state.thinkingLevel
    )
    return state
  })

  ipcMain.handle(IPC_CHANNELS.agent.setThinkingLevel, async (_event, input) => {
    const request = setAgentThinkingLevelRequestSchema.parse(input)
    const state = await getAgentUtilityProcessHost().setThinkingLevel(request)
    if (state.thinkingLevel) {
      await createSessionsService({
        repository: createSessionsRepository()
      }).updateAgentThinkingLevel(state.sessionId, state.thinkingLevel)
    }
    return state
  })
}
