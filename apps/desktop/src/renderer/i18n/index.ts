import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export const LANGUAGE_PREFERENCES = ["system", ...SUPPORTED_LANGUAGES] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

const resources = {
  en: { translation: en },
  fr: { translation: fr },
} satisfies Record<SupportedLanguage, { translation: object }>;

export function isSupportedLanguage(language: unknown): language is SupportedLanguage {
  return typeof language === "string" && SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);
}

export function isLanguagePreference(preference: unknown): preference is LanguagePreference {
  return typeof preference === "string" && LANGUAGE_PREFERENCES.includes(preference as LanguagePreference);
}

export function resolveLanguage(preference: LanguagePreference, systemLanguage: string): SupportedLanguage {
  if (preference !== "system") return preference;

  const baseLanguage = systemLanguage.split("-")[0]?.toLowerCase();
  if (isSupportedLanguage(baseLanguage)) return baseLanguage;

  return "en";
}

export async function initializeRendererI18n(): Promise<void> {
  const settings = await window.spacezero.settings.getLanguageSettings();
  await i18n.changeLanguage(settings.resolvedLanguage);
}

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
