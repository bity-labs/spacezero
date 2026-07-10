import { describe, expect, it } from 'vitest'

import { resolveTheme, resolveThemeSettings, themePreferenceSchema } from './theme'

describe('theme settings', () => {
  it('resolves the system theme from the current color scheme', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveThemeSettings('system', true)).toEqual({ preference: 'system', resolvedTheme: 'dark' })
  })

  it('forces explicit light and dark preferences', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('validates the supported theme preferences', () => {
    expect(themePreferenceSchema.safeParse('system').success).toBe(true)
    expect(themePreferenceSchema.safeParse('light').success).toBe(true)
    expect(themePreferenceSchema.safeParse('dark').success).toBe(true)
    expect(themePreferenceSchema.safeParse('sepia').success).toBe(false)
  })
})
