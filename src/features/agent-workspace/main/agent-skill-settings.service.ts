import { eq } from 'drizzle-orm'
import { resolve } from 'node:path'

import { getDatabase } from '../../../main/db'
import { resolveGlobalAgentSkillPaths } from './agent-skill-paths'
import * as schema from '../../../main/db/schema'
import type {
  AgentGlobalSkill,
  AgentSkillDiscovery,
  AgentSkillPath
} from '../shared/agent-skill.model'

const DISABLED_GLOBAL_SKILL_PATHS_KEY = 'agentSkills.disabledGlobalSkillPaths'

export type GlobalAgentSkillSettingsService = {
  listGlobalSkills: () => Promise<AgentGlobalSkill[]>
  setGlobalSkillEnabled: (skillPath: string, enabled: boolean) => Promise<AgentGlobalSkill[]>
}

export function createGlobalAgentSkillSettingsService({
  listSkills,
  resolveSkillPaths = resolveGlobalAgentSkillPaths
}: {
  listSkills: (skillPaths: AgentSkillPath[]) => Promise<AgentSkillDiscovery[]>
  resolveSkillPaths?: () => Promise<AgentSkillPath[]>
}): GlobalAgentSkillSettingsService {
  async function listGlobalSkills(): Promise<AgentGlobalSkill[]> {
    const [skillPaths, disabledPaths] = await Promise.all([
      resolveSkillPaths(),
      getDisabledGlobalSkillPaths()
    ])
    const skills = await listSkills(skillPaths)
    return applyGlobalSkillSettings(skills, disabledPaths)
  }

  async function setGlobalSkillEnabled(skillPath: string, enabled: boolean): Promise<AgentGlobalSkill[]> {
    const normalizedPath = normalizeSkillPath(skillPath)
    const skills = await listGlobalSkills()
    if (!skills.some((skill) => skill.path === normalizedPath)) {
      throw new Error('agent.globalSkillNotFound')
    }

    await setGlobalSkillEnabledPreference(normalizedPath, enabled)
    return listGlobalSkills()
  }

  return { listGlobalSkills, setGlobalSkillEnabled }
}

export function applyGlobalSkillSettings(
  skills: AgentSkillDiscovery[],
  disabledPaths: string[]
): AgentGlobalSkill[] {
  const disabledPathSet = new Set(disabledPaths.map(normalizeSkillPath))

  return skills.map((skill) => ({
    ...skill,
    path: normalizeSkillPath(skill.path),
    enabled: !disabledPathSet.has(normalizeSkillPath(skill.path))
  }))
}

export function parseDisabledGlobalSkillPaths(value: string | undefined): string[] {
  if (!value) return []

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return [...new Set(parsed.filter((path): path is string => typeof path === 'string').map(normalizeSkillPath))].sort()
  } catch {
    return []
  }
}

export function updateDisabledGlobalSkillPaths(
  currentPaths: string[],
  skillPath: string,
  enabled: boolean
): string[] {
  const nextPaths = new Set(currentPaths.map(normalizeSkillPath))
  const normalizedPath = normalizeSkillPath(skillPath)

  if (enabled) {
    nextPaths.delete(normalizedPath)
  } else {
    nextPaths.add(normalizedPath)
  }

  return [...nextPaths].sort()
}

export async function getDisabledGlobalSkillPaths(): Promise<string[]> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, DISABLED_GLOBAL_SKILL_PATHS_KEY))
    .limit(1)

  return parseDisabledGlobalSkillPaths(storedSetting?.value)
}

export function createGlobalSkillPreferenceMutator({
  readDisabledPaths,
  writeDisabledPaths
}: {
  readDisabledPaths: () => Promise<string[]>
  writeDisabledPaths: (paths: string[]) => Promise<void>
}): (skillPath: string, enabled: boolean) => Promise<void> {
  let mutationQueue: Promise<void> = Promise.resolve()

  return (skillPath, enabled) => {
    const mutation = mutationQueue.then(async () => {
      const currentPaths = await readDisabledPaths()
      const nextPaths = updateDisabledGlobalSkillPaths(currentPaths, skillPath, enabled)
      await writeDisabledPaths(nextPaths)
    })
    mutationQueue = mutation.catch(() => undefined)
    return mutation
  }
}

async function writeDisabledGlobalSkillPaths(paths: string[]): Promise<void> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({
      key: DISABLED_GLOBAL_SKILL_PATHS_KEY,
      value: JSON.stringify(paths),
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: JSON.stringify(paths), updatedAt: now }
    })
}

const mutateGlobalSkillPreference = createGlobalSkillPreferenceMutator({
  readDisabledPaths: getDisabledGlobalSkillPaths,
  writeDisabledPaths: writeDisabledGlobalSkillPaths
})

export function setGlobalSkillEnabledPreference(
  skillPath: string,
  enabled: boolean
): Promise<void> {
  return mutateGlobalSkillPreference(skillPath, enabled)
}

function normalizeSkillPath(path: string): string {
  return resolve(path)
}
