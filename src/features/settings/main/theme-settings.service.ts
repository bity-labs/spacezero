import { nativeTheme } from 'electron'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import { type ThemePreference, type ThemeSettings, resolveThemeSettings } from '../../../shared/theme'

const THEME_PREFERENCE_KEY = 'themePreference'

export async function getThemeSettings(): Promise<ThemeSettings> {
  return resolveThemeSettings(await readThemePreference(), nativeTheme.shouldUseDarkColors)
}

export async function updateThemePreference(preference: ThemePreference): Promise<ThemeSettings> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key: THEME_PREFERENCE_KEY, value: preference, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: preference, updatedAt: now }
    })

  return resolveThemeSettings(preference, nativeTheme.shouldUseDarkColors)
}

async function readThemePreference(): Promise<ThemePreference> {
  const db = getDatabase()
  const [storedPreference] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, THEME_PREFERENCE_KEY))
    .limit(1)

  return storedPreference?.value === 'light' ||
    storedPreference?.value === 'dark' ||
    storedPreference?.value === 'dark-high-contrast' ||
    storedPreference?.value === 'system'
    ? storedPreference.value
    : 'system'
}
