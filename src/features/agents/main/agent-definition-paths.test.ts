import { describe, expect, it } from 'vitest'

import {
  createAgentDefinitionSources,
  createAgentDefinitionsFolderPath,
  createGlobalAgentDefinitionSources
} from './agent-definition-paths'

describe('global agent definition paths', () => {
  it('resolves only Space Zero, user, and bundled sources for global Settings', () => {
    const sources = createGlobalAgentDefinitionSources({
      homePath: '/Users/tiby',
      spaceZeroHome: '/Users/tiby/SpaceZero'
    })

    expect(sources.map((source) => source.scope)).toEqual(['spacezero', 'user', 'bundled'])
    expect(sources[0]).toEqual({ scope: 'spacezero', path: '/Users/tiby/SpaceZero/agents' })
    expect(sources[1]).toEqual({ scope: 'user', path: '/Users/tiby/.agents/agents' })
    expect(sources[2]).toMatchObject({ scope: 'bundled' })
    expect(JSON.stringify(sources)).not.toContain('.agents/agents/project')
  })

  it('includes project sources first only for trusted Project Session contexts', () => {
    const trustedSources = createAgentDefinitionSources({
      cwd: '/Users/tiby/src/app/packages/web',
      homePath: '/Users/tiby',
      spaceZeroHome: '/Users/tiby/SpaceZero',
      includeProjectDefinitions: true
    })

    expect(trustedSources.map((source) => source.scope)).toEqual([
      'project',
      'project',
      'project',
      'project',
      'spacezero',
      'user',
      'bundled'
    ])
    expect(trustedSources[0]).toEqual({
      scope: 'project',
      path: '/Users/tiby/src/app/packages/web/.agents/agents'
    })

    const untrustedSources = createAgentDefinitionSources({
      cwd: '/Users/tiby/src/app',
      homePath: '/Users/tiby',
      spaceZeroHome: '/Users/tiby/SpaceZero',
      includeProjectDefinitions: false
    })
    expect(untrustedSources.map((source) => source.scope)).toEqual(['spacezero', 'user', 'bundled'])
  })

  it('opens only global author-owned agent definition folders', () => {
    expect(
      createAgentDefinitionsFolderPath({
        scope: 'spacezero',
        homePath: '/Users/tiby',
        spaceZeroHome: '/Users/tiby/SpaceZero'
      })
    ).toBe('/Users/tiby/SpaceZero/agents')

    expect(
      createAgentDefinitionsFolderPath({
        scope: 'user',
        homePath: '/Users/tiby',
        spaceZeroHome: '/Users/tiby/SpaceZero'
      })
    ).toBe('/Users/tiby/.agents/agents')
  })
})
