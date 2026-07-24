import { shell } from 'electron'
import { mkdir } from 'node:fs/promises'

import type { AgentDefinitionCatalogEntry, OpenAgentDefinitionsFolderScope } from '../shared'
import { discoverGlobalAgentDefinitions } from './agent-definition-discovery'
import {
  resolveAgentDefinitionsFolderPath,
  resolveGlobalAgentDefinitionSources
} from './agent-definition-paths'

export type AgentDefinitionSettingsService = {
  listGlobalDefinitions: () => Promise<AgentDefinitionCatalogEntry[]>
  openDefinitionsFolder: (scope: OpenAgentDefinitionsFolderScope) => Promise<void>
}

export function createAgentDefinitionSettingsService({
  discoverDefinitions = discoverGlobalAgentDefinitions,
  resolveSources = resolveGlobalAgentDefinitionSources,
  resolveFolderPath = resolveAgentDefinitionsFolderPath,
  openPath = shell.openPath
}: {
  discoverDefinitions?: typeof discoverGlobalAgentDefinitions
  resolveSources?: typeof resolveGlobalAgentDefinitionSources
  resolveFolderPath?: typeof resolveAgentDefinitionsFolderPath
  openPath?: (path: string) => Promise<string>
} = {}): AgentDefinitionSettingsService {
  async function listGlobalDefinitions(): Promise<AgentDefinitionCatalogEntry[]> {
    const sources = await resolveSources()
    return discoverDefinitions({ sources })
  }

  async function openDefinitionsFolder(scope: OpenAgentDefinitionsFolderScope): Promise<void> {
    const folderPath = await resolveFolderPath(scope)
    await mkdir(folderPath, { recursive: true })
    const error = await openPath(folderPath)
    if (error) throw new Error('agentDefinitions.openFolderFailed')
  }

  return { listGlobalDefinitions, openDefinitionsFolder }
}
