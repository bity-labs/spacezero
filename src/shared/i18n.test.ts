import { describe, expect, it } from 'vitest'

import { resolveLanguageSettings } from './i18n'

describe('resolveLanguageSettings', () => {
  it('uses the supported base language from the system locale when preference is system', () => {
    expect(resolveLanguageSettings('system', 'fr-FR')).toEqual({
      preference: 'system',
      resolvedLanguage: 'fr',
      systemLanguage: 'fr-FR'
    })
  })

  it('falls back to English for unsupported system languages', () => {
    expect(resolveLanguageSettings('system', 'es-ES')).toMatchObject({
      preference: 'system',
      resolvedLanguage: 'en'
    })
  })

  it('uses explicit supported language preferences instead of the system language', () => {
    expect(resolveLanguageSettings('fr', 'en-US')).toMatchObject({
      preference: 'fr',
      resolvedLanguage: 'fr'
    })
  })
})
