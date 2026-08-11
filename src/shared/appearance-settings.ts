import { z } from 'zod'

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

export type FontFamilyPreference = (typeof FONT_FAMILY_PREFERENCES)[number]

export type AppearanceSettings = {
  fontFamily: FontFamilyPreference
  thinFontAntialiasing: boolean
}

export const fontFamilyPreferenceSchema = z.enum(FONT_FAMILY_PREFERENCES)

export const updateAppearanceSettingsRequestSchema = z
  .object({
    fontFamily: fontFamilyPreferenceSchema.optional(),
    thinFontAntialiasing: z.boolean().optional()
  })
  .strict()

export type UpdateAppearanceSettingsRequest = z.infer<typeof updateAppearanceSettingsRequestSchema>
