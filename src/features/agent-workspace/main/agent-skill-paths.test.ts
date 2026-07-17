import { describe, expect, it } from 'vitest'

import { createAgentSkillPaths } from './agent-skill-paths'

describe('createAgentSkillPaths', () => {
  it('orders trusted project skills before Space Zero and shared user skills', () => {
    expect(
      createAgentSkillPaths({
        cwd: '/Users/tiby/ws/dev/spacezero',
        homePath: '/Users/tiby',
        spaceZeroHome: '/Users/tiby/SpaceZero',
        includeProjectPaths: true
      })
    ).toEqual([
      { path: '/Users/tiby/ws/dev/spacezero/.agents/skills', scope: 'project' },
      { path: '/Users/tiby/ws/dev/spacezero/.pi/skills', scope: 'project' },
      { path: '/Users/tiby/ws/dev/.agents/skills', scope: 'project' },
      { path: '/Users/tiby/ws/dev/.pi/skills', scope: 'project' },
      { path: '/Users/tiby/ws/.agents/skills', scope: 'project' },
      { path: '/Users/tiby/ws/.pi/skills', scope: 'project' },
      { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' },
      { path: '/Users/tiby/.agents/skills', scope: 'user' }
    ])
  })

  it('denies project skill paths when trust has not been granted', () => {
    expect(
      createAgentSkillPaths({
        cwd: '/Users/tiby/ws/dev/spacezero',
        homePath: '/Users/tiby',
        spaceZeroHome: '/Users/tiby/SpaceZero'
      })
    ).toEqual([
      { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' },
      { path: '/Users/tiby/.agents/skills', scope: 'user' }
    ])
  })

  it('does not scan project paths for a workspace session', () => {
    expect(
      createAgentSkillPaths({
        cwd: '/Users/tiby/Library/Application Support/spacezero/workspace-sessions',
        homePath: '/Users/tiby',
        spaceZeroHome: '/Users/tiby/SpaceZero',
        includeProjectPaths: false
      })
    ).toEqual([
      { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' },
      { path: '/Users/tiby/.agents/skills', scope: 'user' }
    ])
  })

  it('does not treat the Space Zero Home or user home as project skill scopes', () => {
    const paths = createAgentSkillPaths({
      cwd: '/Users/tiby/SpaceZero/projects/example',
      homePath: '/Users/tiby',
      spaceZeroHome: '/Users/tiby/SpaceZero',
      includeProjectPaths: true
    })

    expect(paths.filter((entry) => entry.scope === 'project')).toEqual([
      { path: '/Users/tiby/SpaceZero/projects/example/.agents/skills', scope: 'project' },
      { path: '/Users/tiby/SpaceZero/projects/example/.pi/skills', scope: 'project' },
      { path: '/Users/tiby/SpaceZero/projects/.agents/skills', scope: 'project' },
      { path: '/Users/tiby/SpaceZero/projects/.pi/skills', scope: 'project' },
    ])
  })
})
