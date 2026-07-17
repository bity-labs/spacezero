export type AgentSkillScope = 'project' | 'spacezero' | 'user'

/** A filesystem location that should be scanned for Agent Skills. */
export type AgentSkillPath = {
  path: string
  scope: AgentSkillScope
}

/** Safe metadata exposed to the renderer for skill discovery and commands. */
export type AgentSkillDescriptor = {
  name: string
  description: string
  scope: AgentSkillScope
}

/** Skill metadata discovered from a source path inside the agent utility. */
export type AgentSkillDiscovery = AgentSkillDescriptor & {
  path: string
}

/** Global skill metadata exposed to the Settings UI. */
export type AgentGlobalSkill = AgentSkillDiscovery & {
  enabled: boolean
}

export type SetGlobalAgentSkillEnabledRequest = {
  path: string
  enabled: boolean
}
