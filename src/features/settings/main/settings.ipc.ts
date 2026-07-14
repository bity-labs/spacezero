import { ipcMain } from 'electron'

import { languagePreferenceSchema } from '../../../shared/i18n'
import { IPC_CHANNELS } from '../../../shared/ipc'
import { addApiKeyRequestSchema, providerRequestSchema } from '../../../shared/model-auth'
import { updateModelDefaultsRequestSchema } from '../../../shared/model-settings'
import { themePreferenceSchema } from '../../../shared/theme'
import { getLanguageSettings, updateLanguagePreference } from './language-settings.service'
import { getModelDefaults, updateModelDefaults } from './model-defaults-settings.service'
import {
  addApiKey,
  getAvailableModels,
  getModelAuthSettings,
  loginOAuth,
  testAuth,
  logoutOAuth,
  removeApiKey
} from './model-auth-settings.service'
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

  ipcMain.handle(IPC_CHANNELS.settings.getModelDefaults, () => getModelDefaults())

  ipcMain.handle(IPC_CHANNELS.settings.updateModelDefaults, (_event, request: unknown) => {
    const parsedRequest = updateModelDefaultsRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('settings.invalidUpdateModelDefaultsRequest')
    }

    return updateModelDefaults(parsedRequest.data)
  })

  ipcMain.handle(IPC_CHANNELS.agent.getModelAuthSettings, () => getModelAuthSettings())

  ipcMain.handle(IPC_CHANNELS.agent.getAuthStatus, () => getModelAuthSettings())

  ipcMain.handle(IPC_CHANNELS.agent.getAvailableModels, () => getAvailableModels())

  ipcMain.handle(IPC_CHANNELS.agent.addApiKey, (_event, request: unknown) => {
    const parsedRequest = addApiKeyRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('agent.invalidAddApiKeyRequest')
    }

    return addApiKey(parsedRequest.data.providerId, parsedRequest.data.apiKey)
  })

  ipcMain.handle(IPC_CHANNELS.agent.removeApiKey, (_event, request: unknown) => {
    const parsedRequest = providerRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('agent.invalidRemoveApiKeyRequest')
    }

    return removeApiKey(parsedRequest.data.providerId)
  })

  ipcMain.handle(IPC_CHANNELS.agent.testAuth, (_event, request: unknown) => {
    const parsedRequest = providerRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('agent.invalidTestAuthRequest')
    }

    return testAuth(parsedRequest.data.providerId)
  })

  ipcMain.handle(IPC_CHANNELS.agent.loginOAuth, (_event, request: unknown) => {
    const parsedRequest = providerRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('agent.invalidLoginOAuthRequest')
    }

    return loginOAuth(parsedRequest.data.providerId)
  })

  ipcMain.handle(IPC_CHANNELS.agent.logoutOAuth, (_event, request: unknown) => {
    const parsedRequest = providerRequestSchema.safeParse(request)

    if (!parsedRequest.success) {
      throw new Error('agent.invalidLogoutOAuthRequest')
    }

    return logoutOAuth(parsedRequest.data.providerId)
  })
}
