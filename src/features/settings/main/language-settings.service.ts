import { app } from 'electron'
import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import { type LanguagePreference, type LanguageSettings, resolveLanguageSettings } from '../../../shared/i18n'

const LANGUAGE_PREFERENCE_KEY = 'languagePreference'

export async function getLanguageSettings(): Promise<LanguageSettings> {
  return resolveLanguageSettings(await readLanguagePreference(), getSystemLanguage())
}

export async function updateLanguagePreference(preference: LanguagePreference): Promise<LanguageSettings> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key: LANGUAGE_PREFERENCE_KEY, value: preference, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: preference, updatedAt: now }
    })

  return resolveLanguageSettings(preference, getSystemLanguage())
}

async function readLanguagePreference(): Promise<LanguagePreference> {
  const db = getDatabase()
  const [storedPreference] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, LANGUAGE_PREFERENCE_KEY))
    .limit(1)

  return storedPreference?.value === 'en' || storedPreference?.value === 'fr' || storedPreference?.value === 'system'
    ? storedPreference.value
    : 'system'
}

function getSystemLanguage(): string {
  const [preferredSystemLanguage] = app.getPreferredSystemLanguages()
  return preferredSystemLanguage || app.getLocale() || 'en'
}
