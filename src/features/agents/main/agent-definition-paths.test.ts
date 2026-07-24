import { describe, expect, it } from 'vitest'

import {
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
