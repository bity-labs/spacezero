import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  nativeTheme: { shouldUseDarkColors: false },
  appSettings: new Map<string, string>()
}))

vi.mock('electron', () => ({ nativeTheme: mocks.nativeTheme }))
vi.mock('drizzle-orm', () => ({ eq: (_column: unknown, value: string) => value }))
vi.mock('../../../main/db', () => ({ getDatabase: () => createFakeDb() }))

import { getAppearanceSettings, updateAppearanceSettings } from './appearance-settings.service'

beforeEach(() => {
  mocks.appSettings.clear()
  mocks.nativeTheme.shouldUseDarkColors = false
})

describe('appearance settings service', () => {
  it('returns all default appearance values from one service', async () => {
    await expect(getAppearanceSettings()).resolves.toEqual({
      themePreference: 'system',
      resolvedTheme: 'light',
      fontFamily: 'system',
      thinFontAntialiasing: true
    })
  })

  it('updates and restores any subset of appearance preferences', async () => {
    await expect(
      updateAppearanceSettings({
        themePreference: 'dark-high-contrast',
        fontFamily: 'geist',
        thinFontAntialiasing: false
      })
    ).resolves.toEqual({
      themePreference: 'dark-high-contrast',
      resolvedTheme: 'dark-high-contrast',
      fontFamily: 'geist',
      thinFontAntialiasing: false
    })

    await expect(updateAppearanceSettings({ themePreference: 'light' })).resolves.toEqual({
      themePreference: 'light',
      resolvedTheme: 'light',
      fontFamily: 'geist',
      thinFontAntialiasing: false
    })
  })

  it('resolves System dark mode to regular Dark', async () => {
    mocks.nativeTheme.shouldUseDarkColors = true

    await expect(getAppearanceSettings()).resolves.toMatchObject({
      themePreference: 'system',
      resolvedTheme: 'dark'
    })
  })
})

function createFakeDb() {
  return {
    insert: () => ({
      values: (row: { key: string; value: string }) => ({
        onConflictDoUpdate: () => {
          mocks.appSettings.set(row.key, row.value)
          return Promise.resolve()
        }
      })
    }),
    select: () => ({
      from: () => ({
        where: (key: string) => ({
          limit: () => {
            const value = mocks.appSettings.get(key)
            return Promise.resolve(value === undefined ? [] : [{ value }])
          }
        })
      })
    })
  }
}
