import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { listAgentDefinitionsForSession } from './agent-definition-session-catalog.service'
import { createAgentDefinitionSettingsService } from './agent-definition-settings.service'

const openAgentDefinitionsFolderRequestSchema = z.object({
  scope: z.enum(['spacezero', 'user'])
})

const sessionDefinitionsRequestSchema = z.object({
  sessionId: z.string().trim().min(1)
})

export function registerAgentsIpc(): void {
  const settingsService = createAgentDefinitionSettingsService()

  ipcMain.handle(IPC_CHANNELS.agents.getGlobalDefinitions, () =>
    settingsService.listGlobalDefinitions()
  )

  ipcMain.handle(IPC_CHANNELS.agents.getSessionDefinitions, (_event, input) => {
    const request = sessionDefinitionsRequestSchema.parse(input)
    return listAgentDefinitionsForSession(request.sessionId, {
      repository: createSessionsRepository(),
      worktrees: getManagedWorktreeService()
    })
  })

  ipcMain.handle(IPC_CHANNELS.agents.openDefinitionsFolder, (_event, input) => {
    const request = openAgentDefinitionsFolderRequestSchema.parse(input)
    return settingsService.openDefinitionsFolder(request.scope)
  })
}
