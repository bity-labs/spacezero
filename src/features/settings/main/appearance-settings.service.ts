import { nativeTheme } from 'electron'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import {
  FONT_FAMILY_PREFERENCES,
  THEME_PREFERENCES,
  createDefaultAppearanceSettings,
  resolveTheme,
  type AppearanceSettings,
  type FontFamilyPreference,
  type ThemePreference,
  type UpdateAppearanceSettingsRequest
} from '../../../shared/appearance-settings'

const THEME_PREFERENCE_KEY = 'themePreference'
const FONT_FAMILY_KEY = 'appearance.fontFamily'
const THIN_FONT_ANTIALIASING_KEY = 'appearance.thinFontAntialiasing'

export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  const defaults = createDefaultAppearanceSettings(nativeTheme.shouldUseDarkColors)
  const [storedThemePreference, storedFontFamily, storedThinFontAntialiasing] = await Promise.all([
    readSetting(THEME_PREFERENCE_KEY),
    readSetting(FONT_FAMILY_KEY),
    readSetting(THIN_FONT_ANTIALIASING_KEY)
  ])
  const themePreference = isThemePreference(storedThemePreference)
    ? storedThemePreference
    : defaults.themePreference

  return {
    themePreference,
    resolvedTheme: resolveTheme(themePreference, nativeTheme.shouldUseDarkColors),
    fontFamily: isFontFamilyPreference(storedFontFamily) ? storedFontFamily : defaults.fontFamily,
    thinFontAntialiasing:
      storedThinFontAntialiasing === undefined
        ? defaults.thinFontAntialiasing
        : storedThinFontAntialiasing !== 'false'
  }
}

export async function updateAppearanceSettings(
  request: UpdateAppearanceSettingsRequest
): Promise<AppearanceSettings> {
  const db = getDatabase()
  const now = new Date()
  const updates: Array<{ key: string; value: string; updatedAt: Date }> = []

  if (request.themePreference) {
    updates.push({ key: THEME_PREFERENCE_KEY, value: request.themePreference, updatedAt: now })
  }

  if (request.fontFamily) {
    updates.push({ key: FONT_FAMILY_KEY, value: request.fontFamily, updatedAt: now })
  }

  if (request.thinFontAntialiasing !== undefined) {
    updates.push({
      key: THIN_FONT_ANTIALIASING_KEY,
      value: String(request.thinFontAntialiasing),
      updatedAt: now
    })
  }

  for (const update of updates) {
    await db
      .insert(schema.appSettings)
      .values(update)
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: { value: update.value, updatedAt: update.updatedAt }
      })
  }

  return getAppearanceSettings()
}

async function readSetting(key: string): Promise<string | undefined> {
  const db = getDatabase()
  const [row] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1)

  return row?.value
}

function isThemePreference(value: string | undefined): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
}

function isFontFamilyPreference(value: string | undefined): value is FontFamilyPreference {
  return FONT_FAMILY_PREFERENCES.includes(value as FontFamilyPreference)
}
