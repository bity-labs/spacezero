import { z } from 'zod'

export const THEME_PREFERENCES = ['system', 'light', 'dark', 'dark-high-contrast'] as const
export const RESOLVED_THEMES = ['light', 'dark', 'dark-high-contrast'] as const
export const FONT_FAMILY_PREFERENCES = [
  'system',
  'geist',
  'sf-pro',
  'inter',
  'helvetica',
  'arial',
  'sf-mono',
  'menlo',
  'monaco',
  'jetbrains-mono',
  'monospace'
] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number]
export type FontFamilyPreference = (typeof FONT_FAMILY_PREFERENCES)[number]

export type AppearanceSettings = {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  fontFamily: FontFamilyPreference
  thinFontAntialiasing: boolean
}

export const themePreferenceSchema = z.enum(THEME_PREFERENCES)
export const fontFamilyPreferenceSchema = z.enum(FONT_FAMILY_PREFERENCES)

export const updateAppearanceSettingsRequestSchema = z
  .object({
    themePreference: themePreferenceSchema.optional(),
    fontFamily: fontFamilyPreferenceSchema.optional(),
    thinFontAntialiasing: z.boolean().optional()
  })
  .strict()

export type UpdateAppearanceSettingsRequest = z.infer<typeof updateAppearanceSettingsRequestSchema>

export function createDefaultAppearanceSettings(prefersDark: boolean): AppearanceSettings {
  return {
    themePreference: 'system',
    resolvedTheme: resolveTheme('system', prefersDark),
    fontFamily: 'system',
    thinFontAntialiasing: true
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}
