import { describe, expect, it } from 'vitest'

import {
  applyGlobalSkillSettings,
  parseDisabledGlobalSkillPaths,
  updateDisabledGlobalSkillPaths
} from './agent-skill-settings.service'

describe('global agent skill settings', () => {
  it('marks discovered global skills enabled unless their source path is disabled', () => {
    expect(
      applyGlobalSkillSettings(
        [
          { name: 'code-review', description: 'Review code.', scope: 'user', path: '/skills/code-review/SKILL.md' },
          { name: 'debug', description: 'Debug behavior.', scope: 'spacezero', path: '/skills/debug/SKILL.md' }
        ],
        ['/skills/debug/SKILL.md']
      )
    ).toEqual([
      {
        name: 'code-review',
        description: 'Review code.',
        scope: 'user',
        path: '/skills/code-review/SKILL.md',
        enabled: true
      },
      {
        name: 'debug',
        description: 'Debug behavior.',
        scope: 'spacezero',
        path: '/skills/debug/SKILL.md',
        enabled: false
      }
    ])
  })

  it('persists a normalized disabled path list while toggling skills', () => {
    const initiallyDisabled = parseDisabledGlobalSkillPaths(
      JSON.stringify(['/skills/debug/SKILL.md', '/skills/debug/../debug/SKILL.md'])
    )

    expect(initiallyDisabled).toEqual(['/skills/debug/SKILL.md'])
    expect(
      updateDisabledGlobalSkillPaths(initiallyDisabled, '/skills/code-review/SKILL.md', false)
    ).toEqual(['/skills/code-review/SKILL.md', '/skills/debug/SKILL.md'])
    expect(
      updateDisabledGlobalSkillPaths(
        ['/skills/code-review/SKILL.md', '/skills/debug/SKILL.md'],
        '/skills/code-review/SKILL.md',
        true
      )
    ).toEqual(['/skills/debug/SKILL.md'])
  })
})
