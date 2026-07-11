import { z } from 'zod'

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export const RESOLVED_THEMES = ['light', 'dark'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number]

export type ThemeSettings = {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
}

export const themePreferenceSchema = z.enum(THEME_PREFERENCES)

export function resolveThemeSettings(preference: ThemePreference, prefersDark: boolean): ThemeSettings {
  return {
    preference,
    resolvedTheme: resolveTheme(preference, prefersDark)
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}
