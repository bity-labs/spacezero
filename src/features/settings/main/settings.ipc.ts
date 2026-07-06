import { ipcMain } from 'electron'

import { languagePreferenceSchema } from '../../../shared/i18n'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { getLanguageSettings, updateLanguagePreference } from './language-settings.service'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.settings.getLanguageSettings, () => getLanguageSettings())

  ipcMain.handle(IPC_CHANNELS.settings.updateLanguagePreference, (_event, preference: unknown) => {
    const parsedPreference = languagePreferenceSchema.safeParse(preference)

    if (!parsedPreference.success) {
      throw new Error('settings.invalidLanguagePreference')
    }

    return updateLanguagePreference(parsedPreference.data)
  })
}
