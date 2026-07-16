import { describe, expect, it } from 'vitest'

import {
  createStorageSettings,
  getDefaultSpaceZeroHome,
  normalizeSpaceZeroHome
} from './storage-settings.service'

describe('storage settings paths', () => {
  it('defaults the Space Zero Home below the user home directory', () => {
    expect(getDefaultSpaceZeroHome('/Users/tiby')).toBe('/Users/tiby/SpaceZero')
  })

  it('derives the managed projects path from the Space Zero Home', () => {
    expect(createStorageSettings('/Users/tiby/SpaceZero')).toEqual({
      spaceZeroHome: '/Users/tiby/SpaceZero',
      projectsPath: '/Users/tiby/SpaceZero/projects'
    })
  })

  it('normalizes an absolute configured path', () => {
    expect(normalizeSpaceZeroHome(' /Users/tiby/SpaceZero/.. ')).toBe('/Users/tiby')
    expect(() => normalizeSpaceZeroHome('SpaceZero')).toThrow('settings.storageHomeMustBeAbsolute')
  })
})
