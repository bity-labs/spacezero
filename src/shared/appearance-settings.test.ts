import { describe, expect, it } from 'vitest'

import {
  createDefaultAppearanceSettings,
  resolveTheme,
  themePreferenceSchema,
  updateAppearanceSettingsRequestSchema
} from './appearance-settings'

describe('appearance settings', () => {
  it('provides the default appearance values for the current system theme', () => {
    expect(createDefaultAppearanceSettings(false)).toEqual({
      themePreference: 'system',
      resolvedTheme: 'light',
      fontFamily: 'system',
      thinFontAntialiasing: true
    })
    expect(createDefaultAppearanceSettings(true)).toEqual({
      themePreference: 'system',
      resolvedTheme: 'dark',
      fontFamily: 'system',
      thinFontAntialiasing: true
    })
  })

  it('resolves System from the OS color scheme without enabling high contrast', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
  })

  it('preserves explicit theme preferences', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark-high-contrast', false)).toBe('dark-high-contrast')
  })

  it('validates supported theme preferences', () => {
    expect(themePreferenceSchema.safeParse('system').success).toBe(true)
    expect(themePreferenceSchema.safeParse('light').success).toBe(true)
    expect(themePreferenceSchema.safeParse('dark').success).toBe(true)
    expect(themePreferenceSchema.safeParse('dark-high-contrast').success).toBe(true)
    expect(themePreferenceSchema.safeParse('sepia').success).toBe(false)
  })

  it('accepts one cohesive partial appearance update', () => {
    expect(
      updateAppearanceSettingsRequestSchema.safeParse({
        themePreference: 'dark',
        fontFamily: 'geist',
        thinFontAntialiasing: false
      }).success
    ).toBe(true)
    expect(updateAppearanceSettingsRequestSchema.safeParse({ resolvedTheme: 'dark' }).success).toBe(
      false
    )
  })
})
