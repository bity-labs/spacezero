import { app } from 'electron'
import { dirname, join, resolve } from 'node:path'

import { getStorageSettings } from '../../settings/main/storage-settings.service'
import type { AgentDefinitionSource, OpenAgentDefinitionsFolderScope } from '../shared'
import { BUNDLED_AGENT_DEFINITIONS } from './bundled-agent-definitions'

export async function resolveGlobalAgentDefinitionSources(): Promise<AgentDefinitionSource[]> {
  if (!app?.getPath) return [{ scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }]

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
  return createAgentDefinitionSources({
    homePath,
    spaceZeroHome,
    includeProjectDefinitions: false
  })
}

export async function resolveAgentDefinitionSourcesForSession({
  cwd,
  kind,
  projectTrusted
}: {
  cwd: string
  kind: 'project' | 'workspace'
  projectTrusted: boolean
}): Promise<AgentDefinitionSource[]> {
  if (!app?.getPath) return [{ scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS }]

  const { spaceZeroHome } = await getStorageSettings()
  return createAgentDefinitionSources({
    cwd,
    homePath: app.getPath('home'),
    spaceZeroHome,
    includeProjectDefinitions: kind === 'project' && projectTrusted
  })
}

export function createAgentDefinitionSources({
  cwd,
  homePath,
  spaceZeroHome,
  includeProjectDefinitions = false
}: {
  cwd?: string
  homePath: string
  spaceZeroHome: string
  includeProjectDefinitions?: boolean
}): AgentDefinitionSource[] {
  const resolvedHome = resolve(homePath)
  const resolvedSpaceZeroHome = resolve(spaceZeroHome)
  const sources: AgentDefinitionSource[] = []
  const seen = new Set<string>()

  let current = resolve(cwd ?? resolvedSpaceZeroHome)
  while (
    includeProjectDefinitions &&
    current !== resolvedHome &&
    current !== resolvedSpaceZeroHome &&
    current !== dirname(current)
  ) {
    addDirectorySource(sources, seen, 'project', join(current, '.agents', 'agents'))
    current = dirname(current)
  }

  addDirectorySource(sources, seen, 'spacezero', join(resolvedSpaceZeroHome, 'agents'))
  addDirectorySource(sources, seen, 'user', join(resolvedHome, '.agents', 'agents'))
  sources.push({ scope: 'bundled', definitions: BUNDLED_AGENT_DEFINITIONS })
  return sources
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

function addDirectorySource(
  sources: AgentDefinitionSource[],
  seen: Set<string>,
  scope: 'project' | 'spacezero' | 'user',
  path: string
): void {
  const normalizedPath = resolve(path)
  if (seen.has(normalizedPath)) return
  seen.add(normalizedPath)
  sources.push({ scope, path: normalizedPath })
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
