import { useEffect, useState } from 'react'
import { Key, Plus, Plugs, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { AuthProviderOption, AuthProviderStatus, ModelAuthSettings } from '@shared/model-auth'
import type { AvailableModel, ModelDefaults, ThinkingLevel } from '@shared/model-settings'
import { THINKING_LEVELS } from '@shared/model-settings'

import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Text } from '@renderer/components/ui/typography'
import { SettingsPageHeader } from '../components/settings-page-header'
import { SettingsRow } from '../components/settings-row'
import { SettingsSection } from '../components/settings-section'

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

  const subscriptionProviders = authSettings?.subscriptions.availableProviders ?? []
  const connectedSubscriptions = authSettings?.subscriptions.connected ?? []
  const apiKeyProviders = authSettings?.apiKeys.availableProviders ?? []
  const configuredApiKeys = authSettings?.apiKeys.configured ?? []

  return (
    <>
      <SettingsPageHeader title={t('settings.navigation.models')} />

      <div className="space-y-8">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ModelAuthCard
          title={t('settings.models.subscriptions.title')}
          description={t('settings.models.subscriptions.description')}
          addLabel={t('settings.models.subscriptions.add')}
          emptyTitle={t('settings.models.subscriptions.emptyTitle')}
          emptyDescription={t('settings.models.subscriptions.emptyDescription')}
          icon={<Plugs className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading}
          providers={connectedSubscriptions}
          pendingProviderId={pendingProviderId}
          statusMessage={subscriptionStatusMessage}
          onAdd={() => setSubscriptionPickerOpen(true)}
          onRemove={handleDisconnectSubscription}
          removeLabel={t('settings.models.subscriptions.disconnect')}
        />

        <ModelAuthCard
          title={t('settings.models.apiKeys.title')}
          description={t('settings.models.apiKeys.description')}
          addLabel={t('settings.models.apiKeys.add')}
          emptyTitle={t('settings.models.apiKeys.emptyTitle')}
          emptyDescription={t('settings.models.apiKeys.emptyDescription')}
          icon={<Key className="h-4 w-4" aria-hidden="true" />}
          isLoading={isLoading}
          providers={configuredApiKeys}
          pendingProviderId={pendingProviderId}
          onAdd={() => setApiKeyPickerOpen(true)}
          onRemove={handleRemoveApiKey}
          removeLabel={t('settings.models.apiKeys.remove')}
        />

        <ModelDefaultsCard
          isLoading={isLoading}
          availableModels={availableModels}
          modelDefaults={modelDefaults}
          pickerOpen={defaultModelPickerOpen}
          onPickerOpenChange={setDefaultModelPickerOpen}
          onSelectDefaultModel={(model) => void handleUpdateDefaultModel(model)}
          onSelectDefaultThinking={(thinking) => void handleUpdateDefaultThinking(thinking)}
        />
      </div>

      <ProviderPickerDialog
        open={subscriptionPickerOpen}
        title={t('settings.models.subscriptions.pickerTitle')}
        description={t('settings.models.subscriptions.pickerDescription')}
        providers={subscriptionProviders}
        pendingProviderId={pendingProviderId}
        onOpenChange={setSubscriptionPickerOpen}
        onSelect={(provider) => void handleConnectSubscription(provider)}
      />

      <ProviderPickerDialog
        open={apiKeyPickerOpen}
        title={t('settings.models.apiKeys.pickerTitle')}
        description={t('settings.models.apiKeys.pickerDescription')}
        providers={apiKeyProviders}
        pendingProviderId={pendingProviderId}
        onOpenChange={setApiKeyPickerOpen}
        onSelect={(provider) => {
          setApiKeyPickerOpen(false)
          setSelectedApiKeyProvider(provider)
        }}
      />

      <Dialog
        open={selectedApiKeyProvider !== null}
        onOpenChange={(open) => {
          if (!open) closeApiKeyDialog()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.models.apiKeys.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {selectedApiKeyProvider
                ? t('settings.models.apiKeys.dialogDescription', {
                    provider: selectedApiKeyProvider.label
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={apiKey}
            aria-label={t('settings.models.apiKeys.inputLabel')}
            placeholder={t('settings.models.apiKeys.inputPlaceholder')}
            autoComplete="off"
            onChange={(event) => setApiKey(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeApiKeyDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!apiKey.trim() || pendingProviderId === selectedApiKeyProvider?.providerId}
              onClick={() => void handleSaveApiKey()}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type ModelDefaultsCardProps = {
  isLoading: boolean
  availableModels: AvailableModel[]
  modelDefaults: ModelDefaults | null
  pickerOpen: boolean
  onPickerOpenChange: (open: boolean) => void
  onSelectDefaultModel: (model: AvailableModel) => void
  onSelectDefaultThinking: (thinking: ThinkingLevel) => void
}

function ModelDefaultsCard({
  isLoading,
  availableModels,
  modelDefaults,
  pickerOpen,
  onPickerOpenChange,
  onSelectDefaultModel,
  onSelectDefaultThinking
}: ModelDefaultsCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const selectedModel = findSelectedModel(availableModels, modelDefaults?.defaultModel)
  const hasUnavailableDefault = Boolean(modelDefaults?.defaultModel && !selectedModel)

  return (
    <>
      <SettingsSection title={t('settings.models.defaults.sectionTitle')}>
        {isLoading ? (
          <Text variant="muted" className="px-4 py-6">
            {t('settings.models.defaults.loading')}
          </Text>
        ) : availableModels.length === 0 ? (
          <EmptyState
            title={t('settings.models.defaults.empty')}
            description={t('settings.models.defaults.defaultModelDescription')}
          />
        ) : (
          <>
            {hasUnavailableDefault ? (
              <Text variant="danger" className="border-b border-border/70 px-4 py-3">
                {t('settings.models.defaults.unavailable')}
              </Text>
            ) : null}
            <SettingsRow
              title={t('settings.models.defaults.defaultModel')}
              description={t('settings.models.defaults.defaultModelDescription')}
            >
              <Button variant="outline" size="sm" onClick={() => onPickerOpenChange(true)}>
                {selectedModel
                  ? t('settings.models.modelDisplay', {
                      provider: selectedModel.providerLabel,
                      model: selectedModel.modelLabel
                    })
                  : t('settings.models.defaults.chooseModel')}
              </Button>
            </SettingsRow>
            <SettingsRow
              title={t('settings.models.defaults.defaultThinking')}
              description={t('settings.models.defaults.defaultThinkingDescription')}
            >
              <Select
                value={modelDefaults?.defaultThinking ?? 'medium'}
                onValueChange={(value) => onSelectDefaultThinking(value as ThinkingLevel)}
              >
                <SelectTrigger
                  size="sm"
                  className="w-40"
                  aria-label={t('settings.models.defaults.defaultThinking')}
                >
                  <SelectValue>
                    {(value: ThinkingLevel) => getThinkingLevelLabel(value, t)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {THINKING_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {getThinkingLevelLabel(level, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsRow>
          </>
        )}
      </SettingsSection>

      <ModelBrowserDialog
        open={pickerOpen}
        title={t('settings.models.defaults.pickerTitle')}
        description={t('settings.models.defaults.pickerDescription')}
        models={availableModels}
        modelDefaults={modelDefaults}
        onOpenChange={onPickerOpenChange}
        onAction={onSelectDefaultModel}
      />
    </>
  )
}

type ModelBrowserDialogProps = {
  open: boolean
  title: string
  description: string
  models: AvailableModel[]
  modelDefaults: ModelDefaults | null
  onOpenChange: (open: boolean) => void
  onAction: (model: AvailableModel) => void
}

type ProviderSettingsItemProps = {
  title: string
  description?: string
  details?: string
  badge?: React.ReactNode
  action?: React.ReactNode
  onClick?: () => void
}

function ProviderSettingsItem({
  title,
  description,
  details,
  badge,
  action,
  onClick
}: ProviderSettingsItemProps): React.JSX.Element {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <Text as="div" variant="label" className="truncate leading-5">
          {title}
        </Text>
        {description ? (
          <Text as="div" variant="subtle" className="mt-1 truncate leading-4">
            {description}
          </Text>
        ) : null}
        {details ? (
          <Text as="div" variant="subtle" className="mt-1 line-clamp-2 leading-4">
            {details}
          </Text>
        ) : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">
      {content}
    </div>
  )
}

function ModelBrowserDialog({
  open,
  title,
  description,
  models,
  modelDefaults,
  onOpenChange,
  onAction
}: ModelBrowserDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const filteredModels = filterModels(models, query)
  const providerGroups = groupModelsByProvider(filteredModels, modelDefaults?.defaultModel)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          aria-label={t('settings.models.available.search')}
          placeholder={t('settings.models.available.search')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-96 space-y-4 overflow-auto pr-1">
          {providerGroups.length === 0 ? (
            <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
              {t('settings.models.available.noMatches')}
            </p>
          ) : (
            providerGroups.map((group) => (
              <section
                key={group.providerId}
                aria-label={group.providerLabel}
                className="space-y-2"
              >
                <h4>
                  <Text as="span" variant="label" className="text-muted-foreground">
                    {group.providerLabel}
                  </Text>
                </h4>
                <div className="space-y-2">
                  {group.models.map((model) => {
                    const isDefault = isSameModel(model, modelDefaults?.defaultModel)

                    return (
                      <ProviderSettingsItem
                        key={`${model.providerId}-${model.modelId}`}
                        title={model.modelLabel}
                        description={model.providerLabel}
                        details={model.description}
                        badge={
                          isDefault ? (
                            <Badge variant="secondary">
                              {t('settings.models.available.defaultBadge')}
                            </Badge>
                          ) : null
                        }
                        onClick={() => onAction(model)}
                      />
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function findSelectedModel(
  availableModels: AvailableModel[],
  defaultModel: ModelDefaults['defaultModel']
): AvailableModel | undefined {
  if (!defaultModel) return undefined
  return availableModels.find((model) => isSameModel(model, defaultModel))
}

function isSameModel(model: AvailableModel, defaultModel: ModelDefaults['defaultModel']): boolean {
  return model.providerId === defaultModel?.providerId && model.modelId === defaultModel.modelId
}

function groupModelsByProvider(
  models: AvailableModel[],
  defaultModel: ModelDefaults['defaultModel']
): Array<{
  providerId: string
  providerLabel: string
  models: AvailableModel[]
}> {
  const groups = new Map<
    string,
    { providerId: string; providerLabel: string; models: AvailableModel[] }
  >()

  for (const model of models) {
    const existing = groups.get(model.providerId)
    if (existing) {
      existing.models.push(model)
    } else {
      groups.set(model.providerId, {
        providerId: model.providerId,
        providerLabel: model.providerLabel,
        models: [model]
      })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      models: group.models.sort((a, b) => {
        if (isSameModel(a, defaultModel)) return -1
        if (isSameModel(b, defaultModel)) return 1
        return a.modelLabel.localeCompare(b.modelLabel)
      })
    }))
    .sort((a, b) => {
      const aHasDefault = a.models.some((model) => isSameModel(model, defaultModel))
      const bHasDefault = b.models.some((model) => isSameModel(model, defaultModel))
      if (aHasDefault) return -1
      if (bHasDefault) return 1
      return a.providerLabel.localeCompare(b.providerLabel)
    })
}

function filterModels(models: AvailableModel[], query: string): AvailableModel[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return models

  return models.filter((model) =>
    `${model.providerLabel} ${model.modelLabel} ${model.modelId}`
      .toLowerCase()
      .includes(normalizedQuery)
  )
}

function getThinkingLevelLabel(
  level: ThinkingLevel,
  t: ReturnType<typeof useTranslation>['t']
): string {
  return t(`settings.models.defaults.thinking.${level}`)
}

type ModelAuthCardProps = {
  title: string
  description: string
  addLabel: string
  emptyTitle: string
  emptyDescription: string
  icon: React.ReactNode
  isLoading: boolean
  providers: AuthProviderStatus[]
  pendingProviderId: string | null
  removeLabel: string
  statusMessage?: string | null
  addDisabled?: boolean
  disabledReason?: string
  onAdd: () => void
  onRemove: (provider: AuthProviderStatus) => Promise<void>
}

function ModelAuthCard({
  title,
  description,
  addLabel,
  emptyTitle,
  emptyDescription,
  icon,
  isLoading,
  providers,
  pendingProviderId,
  removeLabel,
  statusMessage,
  addDisabled = false,
  disabledReason,
  onAdd,
  onRemove
}: ModelAuthCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const showAddFooter = !isLoading && providers.length > 0

  return (
    <SettingsSection
      title={title}
      description={description}
      footer={
        showAddFooter ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={addDisabled}
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {addLabel}
            </Button>
            {disabledReason ? <Badge variant="secondary">{disabledReason}</Badge> : null}
          </div>
        ) : null
      }
    >
      {statusMessage ? (
        <Text
          role="status"
          aria-live="polite"
          variant="muted"
          className="border-b border-border/70 px-4 py-3"
        >
          {statusMessage}
        </Text>
      ) : null}
      {isLoading ? (
        <Text variant="muted" className="px-4 py-6">
          {t('settings.models.auth.loading')}
        </Text>
      ) : providers.length === 0 ? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          actions={
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={addDisabled}
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {addLabel}
            </Button>
          }
        />
      ) : (
        providers.map((provider) => (
          <ProviderSettingsItem
            key={`${provider.providerId}-${provider.source ?? 'unknown'}`}
            title={provider.label}
            description={provider.displayLabel ?? t('settings.models.auth.connected')}
            action={
              provider.removable ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={pendingProviderId === provider.providerId}
                  aria-label={removeLabel}
                  onClick={() => void onRemove(provider)}
                >
                  <Trash className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Badge variant="secondary">{t('settings.models.auth.notRemovable')}</Badge>
              )
            }
          />
        ))
      )}
    </SettingsSection>
  )
}

type ProviderPickerDialogProps = {
  open: boolean
  title: string
  description: string
  providers: AuthProviderOption[]
  pendingProviderId: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (provider: AuthProviderOption) => void
}

function ProviderPickerDialog({
  open,
  title,
  description,
  providers,
  pendingProviderId,
  onOpenChange,
  onSelect
}: ProviderPickerDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const filteredProviders = providers.filter((provider) =>
    `${provider.label} ${provider.description ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          aria-label={t('settings.models.auth.searchProviders')}
          placeholder={t('settings.models.auth.searchProviders')}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-72 space-y-2 overflow-auto">
          {filteredProviders.length === 0 ? (
            <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
              {t('settings.models.auth.noProviders')}
            </p>
          ) : (
            filteredProviders.map((provider) => (
              <Button
                key={provider.providerId}
                variant="outline"
                className="h-auto w-full justify-start px-3 py-3 text-left"
                disabled={pendingProviderId === provider.providerId}
                onClick={() => onSelect(provider)}
              >
                <span>
                  <span className="block text-sm font-medium">{provider.label}</span>
                  {provider.description ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {provider.description}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
