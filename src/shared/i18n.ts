import { z } from 'zod'

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const
export const LANGUAGE_PREFERENCES = ['system', ...SUPPORTED_LANGUAGES] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number]

export type LanguageSettings = {
  preference: LanguagePreference
  resolvedLanguage: SupportedLanguage
  systemLanguage: string
}

export type TranslationCodePayload = {
  code: string
  params?: Record<string, string | number | boolean | null>
}

export const languagePreferenceSchema = z.enum(LANGUAGE_PREFERENCES)

export function resolveLanguageSettings(preference: LanguagePreference, systemLanguage: string): LanguageSettings {
  return {
    preference,
    resolvedLanguage: resolveLanguage(preference, systemLanguage),
    systemLanguage
  }
}

export function resolveLanguage(preference: LanguagePreference, systemLanguage: string): SupportedLanguage {
  if (preference !== 'system') return preference

  const baseLanguage = systemLanguage.split('-')[0]?.toLowerCase()
  if (isSupportedLanguage(baseLanguage)) return baseLanguage

  return 'en'
}

export function isSupportedLanguage(language: unknown): language is SupportedLanguage {
  return typeof language === 'string' && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
}
