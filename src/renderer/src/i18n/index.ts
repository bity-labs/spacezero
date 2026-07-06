import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import type { SupportedLanguage } from '@shared/i18n'
import en from './locales/en.json'
import fr from './locales/fr.json'

const resources = {
  en: { translation: en },
  fr: { translation: fr }
} satisfies Record<SupportedLanguage, { translation: object }>

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

export async function initializeRendererI18n(): Promise<void> {
  const settings = await window.spacezero.settings.getLanguageSettings()
  await i18n.changeLanguage(settings.resolvedLanguage)
}

export { i18n }
