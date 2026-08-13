import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AuthProviderOption, AuthProviderStatus, ModelAuthSettings } from '@shared/model-auth'
import type { AvailableModel, ModelDefaults, ThinkingLevel } from '@shared/model-settings'

import { ModelsSettingsScreen } from '../screens/models-settings-screen'

export function ProvidersSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [authSettings, setAuthSettings] = useState<ModelAuthSettings | null>(null)
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelDefaults, setModelDefaults] = useState<ModelDefaults | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null)
  const [subscriptionStatusMessage, setSubscriptionStatusMessage] = useState<string | null>(null)
  const [subscriptionPickerOpen, setSubscriptionPickerOpen] = useState(false)
  const [apiKeyPickerOpen, setApiKeyPickerOpen] = useState(false)
  const [selectedApiKeyProvider, setSelectedApiKeyProvider] = useState<AuthProviderOption | null>(
    null
  )
  const [apiKey, setApiKey] = useState('')
  const [defaultModelPickerOpen, setDefaultModelPickerOpen] = useState(false)

  async function loadModelSettings(): Promise<{
    authSettings: ModelAuthSettings
    availableModels: AvailableModel[]
    modelDefaults: ModelDefaults
  }> {
    const [nextAuthSettings, nextAvailableModels, nextModelDefaults] = await Promise.all([
      window.spacezero.agent.getModelAuthSettings(),
      window.spacezero.agent.getAvailableModels(),
      window.spacezero.settings.getModelDefaults()
    ])

    return {
      authSettings: nextAuthSettings,
      availableModels: nextAvailableModels,
      modelDefaults: nextModelDefaults
    }
  }

  async function refreshModelSettings(): Promise<void> {
    setIsLoading(true)
    setError(null)

    try {
      const settings = await loadModelSettings()
      setAuthSettings(settings.authSettings)
      setAvailableModels(settings.availableModels)
      setModelDefaults(settings.modelDefaults)
    } catch {
      setError(t('settings.models.auth.loadError'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isCurrent = true

    loadModelSettings()
      .then((settings) => {
        if (!isCurrent) return
        setAuthSettings(settings.authSettings)
        setAvailableModels(settings.availableModels)
        setModelDefaults(settings.modelDefaults)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(t('settings.models.auth.loadError'))
      })
      .finally(() => {
        if (!isCurrent) return
        setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [t])

  function closeApiKeyDialog(): void {
    setSelectedApiKeyProvider(null)
    setApiKey('')
  }

  async function handleConnectSubscription(provider: AuthProviderOption): Promise<void> {
    setPendingProviderId(provider.providerId)
    setError(null)

    try {
      setSubscriptionStatusMessage(t('settings.models.subscriptions.waitingForBrowser'))
      await window.spacezero.agent.loginOAuth({ providerId: provider.providerId })
      setSubscriptionPickerOpen(false)
      setSubscriptionStatusMessage(t('settings.models.subscriptions.loginSuccess'))
      await refreshModelSettings()
    } catch {
      setSubscriptionStatusMessage(null)
      setError(t('settings.models.subscriptions.loginError'))
    } finally {
      setPendingProviderId(null)
    }
  }

  async function handleDisconnectSubscription(provider: AuthProviderStatus): Promise<void> {
    if (
      !window.confirm(
        t('settings.models.subscriptions.disconnectConfirm', { provider: provider.label })
      )
    )
      return

    setPendingProviderId(provider.providerId)
    setError(null)

    try {
      setSubscriptionStatusMessage(t('settings.models.subscriptions.disconnecting'))
      await window.spacezero.agent.logoutOAuth({ providerId: provider.providerId })
      setSubscriptionStatusMessage(t('settings.models.subscriptions.logoutSuccess'))
      await refreshModelSettings()
    } catch {
      setSubscriptionStatusMessage(null)
      setError(t('settings.models.subscriptions.logoutError'))
    } finally {
      setPendingProviderId(null)
    }
  }

  async function handleSaveApiKey(): Promise<void> {
    if (!selectedApiKeyProvider || !apiKey.trim()) return

    setPendingProviderId(selectedApiKeyProvider.providerId)
    setError(null)

    try {
      await window.spacezero.agent.addApiKey({
        providerId: selectedApiKeyProvider.providerId,
        apiKey: apiKey.trim()
      })
      closeApiKeyDialog()
      await refreshModelSettings()
    } catch {
      setError(t('settings.models.apiKeys.saveError'))
    } finally {
      setPendingProviderId(null)
    }
  }

  async function handleRemoveApiKey(provider: AuthProviderStatus): Promise<void> {
    if (!window.confirm(t('settings.models.apiKeys.removeConfirm', { provider: provider.label })))
      return

    setPendingProviderId(provider.providerId)
    setError(null)

    try {
      await window.spacezero.agent.removeApiKey({ providerId: provider.providerId })
      await refreshModelSettings()
    } catch {
      setError(t('settings.models.apiKeys.removeError'))
    } finally {
      setPendingProviderId(null)
    }
  }

  async function handleUpdateDefaultModel(model: AvailableModel): Promise<void> {
    setError(null)

    try {
      const defaults = await window.spacezero.settings.updateModelDefaults({
        defaultModel: { providerId: model.providerId, modelId: model.modelId }
      })
      setModelDefaults(defaults)
      setDefaultModelPickerOpen(false)
    } catch {
      setError(t('settings.models.defaults.saveError'))
    }
  }

  async function handleUpdateDefaultThinking(defaultThinking: ThinkingLevel): Promise<void> {
    setError(null)

    try {
      setModelDefaults(await window.spacezero.settings.updateModelDefaults({ defaultThinking }))
    } catch {
      setError(t('settings.models.defaults.saveError'))
    }
  }

  return (
    <ModelsSettingsScreen
      authSettings={authSettings}
      availableModels={availableModels}
      modelDefaults={modelDefaults}
      isLoading={isLoading}
      error={error}
      pendingProviderId={pendingProviderId}
      subscriptionStatusMessage={subscriptionStatusMessage}
      subscriptionPickerOpen={subscriptionPickerOpen}
      apiKeyPickerOpen={apiKeyPickerOpen}
      selectedApiKeyProvider={selectedApiKeyProvider}
      apiKey={apiKey}
      defaultModelPickerOpen={defaultModelPickerOpen}
      onSubscriptionPickerOpenChange={setSubscriptionPickerOpen}
      onApiKeyPickerOpenChange={setApiKeyPickerOpen}
      onApiKeyProviderSelect={(provider) => {
        setApiKeyPickerOpen(false)
        setSelectedApiKeyProvider(provider)
      }}
      onApiKeyChange={setApiKey}
      onApiKeyDialogClose={closeApiKeyDialog}
      onConnectSubscription={(provider) => void handleConnectSubscription(provider)}
      onDisconnectSubscription={(provider) => void handleDisconnectSubscription(provider)}
      onSaveApiKey={() => void handleSaveApiKey()}
      onRemoveApiKey={(provider) => void handleRemoveApiKey(provider)}
      onDefaultModelPickerOpenChange={setDefaultModelPickerOpen}
      onSelectDefaultModel={(model) => void handleUpdateDefaultModel(model)}
      onSelectDefaultThinking={(thinking) => void handleUpdateDefaultThinking(thinking)}
    />
  )
}
