import type {
  AgentDefinitionReference,
  DelegationAgentDefinition,
  ResolvedAgentDefinition
} from '../../../shared/agent-protocol'
import { THINKING_LEVELS, type ThinkingLevel } from '../../../shared/model-settings'
import type { AgentDefinitionCatalogEntry, AgentDefinitionSource } from '../shared'
import { discoverGlobalAgentDefinitions } from './agent-definition-discovery'
import { resolveGlobalAgentDefinitionSources } from './agent-definition-paths'

export type ResolveAgentDefinitionForSession = (
  reference: AgentDefinitionReference
) => Promise<ResolvedAgentDefinition>

export type ResolveAgentDefinitionsForDelegation = () => Promise<DelegationAgentDefinition[]>

export async function resolveAgentDefinitionsForDelegation({
  resolveSources = resolveGlobalAgentDefinitionSources,
  discoverDefinitions = discoverGlobalAgentDefinitions
}: {
  resolveSources?: () => Promise<AgentDefinitionSource[]>
  discoverDefinitions?: typeof discoverGlobalAgentDefinitions
} = {}): Promise<DelegationAgentDefinition[]> {
  const catalog = await discoverDefinitions({ sources: await resolveSources() })
  return catalog.flatMap((entry) => {
    if (entry.status !== 'valid' || entry.shadowedBy) return []
    try {
      return [toDelegationAgentDefinition(entry)]
    } catch {
      return []
    }
  })
}

export async function resolveAgentDefinitionForSession(
  reference: AgentDefinitionReference,
  {
    resolveSources = resolveGlobalAgentDefinitionSources,
    discoverDefinitions = discoverGlobalAgentDefinitions
  }: {
    resolveSources?: () => Promise<AgentDefinitionSource[]>
    discoverDefinitions?: typeof discoverGlobalAgentDefinitions
  } = {}
): Promise<ResolvedAgentDefinition> {
  const id = reference.id.trim()
  if (!id) throw new Error('agentDefinitions.definitionNotFound')

  const catalog = await discoverDefinitions({ sources: await resolveSources() })
  const definition = catalog.find(
    (entry) => entry.id === id && entry.status === 'valid' && !entry.shadowedBy
  )

  if (!definition) throw new Error('agentDefinitions.definitionNotFound')
  return toResolvedAgentDefinition(definition)
}

function toResolvedAgentDefinition(
  definition: AgentDefinitionCatalogEntry
): ResolvedAgentDefinition {
  const resolved = toBaseResolvedAgentDefinition(definition)
  return {
    id: resolved.id,
    name: resolved.name,
    body: resolved.body,
    ...(resolved.model ? { model: resolved.model } : {}),
    ...(resolved.thinkingLevel ? { thinkingLevel: resolved.thinkingLevel } : {}),
    ...(resolved.tools ? { tools: resolved.tools } : {})
  }
}

function toDelegationAgentDefinition(
  definition: AgentDefinitionCatalogEntry
): DelegationAgentDefinition {
  const resolved = toBaseResolvedAgentDefinition(definition)
  if (!definition.description) throw new Error('agentDefinitions.definitionInvalid')

  return {
    ...resolved,
    description: definition.description
  }
}

function toBaseResolvedAgentDefinition(
  definition: AgentDefinitionCatalogEntry
): ResolvedAgentDefinition {
  if (!definition.name || definition.body === undefined) {
    throw new Error('agentDefinitions.definitionInvalid')
  }

  return {
    id: definition.id,
    name: definition.name,
    body: definition.body,
    ...(definition.model ? { model: parseDefinitionModel(definition.model) } : {}),
    ...(definition.thinking ? { thinkingLevel: parseThinkingLevel(definition.thinking) } : {}),
    ...(definition.tools ? { tools: definition.tools } : {})
  }
}

function parseDefinitionModel(model: string): { providerId: string; modelId: string } {
  const separatorIndex = model.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
    throw new Error('agentDefinitions.invalidModel')
  }

  const providerId = model.slice(0, separatorIndex).trim()
  const modelId = model.slice(separatorIndex + 1).trim()
  if (!providerId || !modelId) throw new Error('agentDefinitions.invalidModel')
  return { providerId, modelId }
}

function parseThinkingLevel(thinking: string): ThinkingLevel {
  if (THINKING_LEVELS.includes(thinking as ThinkingLevel)) return thinking as ThinkingLevel
  throw new Error('agentDefinitions.invalidThinkingLevel')
}
