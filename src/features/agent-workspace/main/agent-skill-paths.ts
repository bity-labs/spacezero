import { app } from 'electron'
import { dirname, join, resolve } from 'node:path'

import type { AgentSkillPath } from '../shared/agent-skill.model'
import { getStorageSettings } from '../../settings/main/storage-settings.service'

export async function resolveAgentSkillPaths(
  cwd: string,
  kind: 'project' | 'workspace' = 'project',
  projectTrusted = false
): Promise<AgentSkillPath[]> {
  const { spaceZeroHome } = await getStorageSettings()
  return createAgentSkillPaths({
    cwd,
    homePath: app.getPath('home'),
    spaceZeroHome,
    includeProjectPaths: kind === 'project' && projectTrusted
  })
}

export async function resolveGlobalAgentSkillPaths(): Promise<AgentSkillPath[]> {
  const { spaceZeroHome } = await getStorageSettings()
  return createAgentSkillPaths({
    cwd: spaceZeroHome,
    homePath: app.getPath('home'),
    spaceZeroHome,
    includeProjectPaths: false
  })
}

export function createAgentSkillPaths({
  cwd,
  homePath,
  spaceZeroHome,
  includeProjectPaths = false
}: {
  cwd: string
  homePath: string
  spaceZeroHome: string
  includeProjectPaths?: boolean
}): AgentSkillPath[] {
  const paths: AgentSkillPath[] = []
  const seen = new Set<string>()
  const resolvedCwd = resolve(cwd)
  const resolvedHome = resolve(homePath)
  const resolvedSpaceZeroHome = resolve(spaceZeroHome)

  let current = resolvedCwd
  while (
    includeProjectPaths &&
    current !== resolvedHome &&
    current !== resolvedSpaceZeroHome &&
    current !== dirname(current)
  ) {
    addPath(join(current, '.agents', 'skills'), 'project', paths, seen)
    addPath(join(current, '.pi', 'skills'), 'project', paths, seen)
    current = dirname(current)
  }

  addPath(join(resolvedSpaceZeroHome, 'skills'), 'spacezero', paths, seen)
  addPath(join(resolvedHome, '.agents', 'skills'), 'user', paths, seen)

  return paths
}

function addPath(
  path: string,
  scope: AgentSkillPath['scope'],
  paths: AgentSkillPath[],
  seen: Set<string>
): void {
  const normalizedPath = resolve(path)
  if (seen.has(normalizedPath)) return
  seen.add(normalizedPath)
  paths.push({ path: normalizedPath, scope })
}
