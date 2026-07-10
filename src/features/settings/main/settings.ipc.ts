import { ipcMain } from 'electron'

import { languagePreferenceSchema } from '../../../shared/i18n'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { themePreferenceSchema } from '../../../shared/theme'
import { getLanguageSettings, updateLanguagePreference } from './language-settings.service'
import { getThemeSettings, updateThemePreference } from './theme-settings.service'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.settings.getLanguageSettings, () => getLanguageSettings())

  ipcMain.handle(IPC_CHANNELS.settings.updateLanguagePreference, (_event, preference: unknown) => {
    const parsedPreference = languagePreferenceSchema.safeParse(preference)

    if (!parsedPreference.success) {
      throw new Error('settings.invalidLanguagePreference')
    }

    return updateLanguagePreference(parsedPreference.data)
  })

  ipcMain.handle(IPC_CHANNELS.settings.getThemeSettings, () => getThemeSettings())

  ipcMain.handle(IPC_CHANNELS.settings.updateThemePreference, (_event, preference: unknown) => {
    const parsedPreference = themePreferenceSchema.safeParse(preference)

    if (!parsedPreference.success) {
      throw new Error('settings.invalidThemePreference')
    }

    return updateThemePreference(parsedPreference.data)
  })
}
