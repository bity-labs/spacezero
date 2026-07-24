import { app } from 'electron'
import { join, resolve } from 'node:path'

import { getStorageSettings } from '../../settings/main/storage-settings.service'
import type { AgentDefinitionSource, OpenAgentDefinitionsFolderScope } from '../shared'
import { BUNDLED_AGENT_DEFINITIONS } from './bundled-agent-definitions'

export async function resolveGlobalAgentDefinitionSources(): Promise<AgentDefinitionSource[]> {
  const { spaceZeroHome } = await getStorageSettings()
  return createGlobalAgentDefinitionSources({
    homePath: app.getPath('home'),
    spaceZeroHome
  })
}

export function createGlobalAgentDefinitionSources({
  homePath,
  spaceZeroHome
}: {
  homePath: string
  spaceZeroHome: string
}): AgentDefinitionSource[] {
  const resolvedHome = resolve(homePath)
  const resolvedSpaceZeroHome = resolve(spaceZeroHome)

  return [
    { scope: 'spacezero', path: join(resolvedSpaceZeroHome, 'agents') },
    { scope: 'user', path: join(resolvedHome, '.agents', 'agents') },
    { scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }
  ]
}

export async function resolveAgentDefinitionsFolderPath(
  scope: OpenAgentDefinitionsFolderScope
): Promise<string> {
  const { spaceZeroHome } = await getStorageSettings()
  return createAgentDefinitionsFolderPath({
    scope,
    homePath: app.getPath('home'),
    spaceZeroHome
  })
}

export function createAgentDefinitionsFolderPath({
  scope,
  homePath,
  spaceZeroHome
}: {
  scope: OpenAgentDefinitionsFolderScope
  homePath: string
  spaceZeroHome: string
}): string {
  if (scope === 'spacezero') return join(resolve(spaceZeroHome), 'agents')
  return join(resolve(homePath), '.agents', 'agents')
}
