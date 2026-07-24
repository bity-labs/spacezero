import { ipcMain } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { createAgentDefinitionSettingsService } from './agent-definition-settings.service'

const openAgentDefinitionsFolderRequestSchema = z.object({
  scope: z.enum(['spacezero', 'user'])
})

export function registerAgentsIpc(): void {
  const settingsService = createAgentDefinitionSettingsService()

  ipcMain.handle(IPC_CHANNELS.agents.getGlobalDefinitions, () =>
    settingsService.listGlobalDefinitions()
  )

  ipcMain.handle(IPC_CHANNELS.agents.openDefinitionsFolder, (_event, input) => {
    const request = openAgentDefinitionsFolderRequestSchema.parse(input)
    return settingsService.openDefinitionsFolder(request.scope)
  })
}
