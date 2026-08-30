import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import fr from "./locales/fr.json";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export const LANGUAGE_PREFERENCES = ["system", ...SUPPORTED_LANGUAGES] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

const LANGUAGE_PREFERENCE_STORAGE_KEY = "spacezero.languagePreference";

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

export function resolveLanguage(preference: LanguagePreference, systemLanguage = navigator.language): SupportedLanguage {
  if (preference !== "system") return preference;

  const baseLanguage = systemLanguage.split("-")[0]?.toLowerCase();
  if (isSupportedLanguage(baseLanguage)) return baseLanguage;

  return "en";
}

export function getLanguagePreference(): LanguagePreference {
  const storedPreference = window.localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
  return isLanguagePreference(storedPreference) ? storedPreference : "system";
}

export function setLanguagePreference(preference: LanguagePreference): void {
  window.localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, preference);
  void i18n.changeLanguage(resolveLanguage(preference));
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(getLanguagePreference()),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
