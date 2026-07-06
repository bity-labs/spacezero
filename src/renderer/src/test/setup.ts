import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

import { i18n } from '../i18n'

beforeEach(async () => {
  window.scrollTo = vi.fn()
  window.location.hash = ''
  await i18n.changeLanguage('en')

  window.spacezero = {
    app: {
      getInfo: async () => ({ name: 'Space Zero', version: '0.0.0-test', platform: 'darwin' }),
      ping: async () => 'pong'
    },
    db: {
      health: async () => ({ ok: true, path: '/tmp/spacezero-test.sqlite3', projectCount: 0 })
    },
    settings: {
      getLanguageSettings: async () => ({ preference: 'system', resolvedLanguage: 'en', systemLanguage: 'en-US' }),
      updateLanguagePreference: async (preference) => ({
        preference,
        resolvedLanguage: preference === 'system' ? 'en' : preference,
        systemLanguage: 'en-US'
      })
    }
  }
})
