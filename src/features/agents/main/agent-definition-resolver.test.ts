import { describe, expect, it } from 'vitest'

import type { AgentDefinitionCatalogEntry } from '../shared'
import { resolveAgentDefinitionForSession } from './agent-definition-resolver'

function validDefinition(overrides: Partial<AgentDefinitionCatalogEntry> = {}): AgentDefinitionCatalogEntry {
  return {
    id: 'reviewer',
    scope: 'spacezero',
    path: '/SpaceZero/agents/reviewer.md',
    status: 'valid',
    diagnostics: [],
    name: 'Reviewer',
    description: 'Reviews code.',
    body: 'Review code carefully.',
    ...overrides
  }
}

describe('resolveAgentDefinitionForSession', () => {
  it('resolves the active global Agent Definition into utility session configuration', async () => {
    await expect(
      resolveAgentDefinitionForSession(
        { id: 'reviewer' },
        {
          resolveSources: async () => [],
          discoverDefinitions: async () => [
            validDefinition({
              model: 'faux/faux-1',
              thinking: 'high',
              tools: ['read', 'grep', 'workspace.getStatus']
            })
          ]
        }
      )
    ).resolves.toEqual({
      id: 'reviewer',
      name: 'Reviewer',
      body: 'Review code carefully.',
      model: { providerId: 'faux', modelId: 'faux-1' },
      thinkingLevel: 'high',
      tools: ['read', 'grep', 'workspace.getStatus']
    })
  })

  it('ignores shadowed definitions and errors when no active valid definition exists', async () => {
    await expect(
      resolveAgentDefinitionForSession(
        { id: 'reviewer' },
        {
          resolveSources: async () => [],
          discoverDefinitions: async () => [
            validDefinition({ shadowedBy: 'spacezero' }),
            validDefinition({ id: 'scout', name: 'Scout' })
          ]
        }
      )
    ).rejects.toThrow('agentDefinitions.definitionNotFound')
  })

  it('rejects malformed model and thinking values at use time', async () => {
    await expect(
      resolveAgentDefinitionForSession(
        { id: 'reviewer' },
        {
          resolveSources: async () => [],
          discoverDefinitions: async () => [validDefinition({ model: 'missing-separator' })]
        }
      )
    ).rejects.toThrow('agentDefinitions.invalidModel')

    await expect(
      resolveAgentDefinitionForSession(
        { id: 'reviewer' },
        {
          resolveSources: async () => [],
          discoverDefinitions: async () => [validDefinition({ thinking: 'extreme' })]
        }
      )
    ).rejects.toThrow('agentDefinitions.invalidThinkingLevel')
  })
})
