import { describe, expect, it } from 'vitest'

import { resolveTheme, resolveThemeSettings, themePreferenceSchema } from './theme'

describe('theme settings', () => {
  it('resolves the system theme from the current color scheme', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveThemeSettings('system', true)).toEqual({ preference: 'system', resolvedTheme: 'dark' })
  })

  it('forces explicit light, dark, and dark high contrast preferences', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark-high-contrast', false)).toBe('dark-high-contrast')
  })

  it('validates the supported theme preferences', () => {
    expect(themePreferenceSchema.safeParse('system').success).toBe(true)
    expect(themePreferenceSchema.safeParse('light').success).toBe(true)
    expect(themePreferenceSchema.safeParse('dark').success).toBe(true)
    expect(themePreferenceSchema.safeParse('dark-high-contrast').success).toBe(true)
    expect(themePreferenceSchema.safeParse('sepia').success).toBe(false)
  })
})
