import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Cube, GearSix, Key, Plus, Plugs, Trash } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { AuthProviderOption, AuthProviderStatus, ModelAuthSettings } from '@shared/model-auth'
import type { AvailableModel, ModelDefaults, ThinkingLevel } from '@shared/model-settings'
import { THINKING_LEVELS } from '@shared/model-settings'
import type { ThemePreference } from '@shared/theme'
import { AccountMenu } from '../components/app-shell/account-menu'
import { SettingsRow } from '../../../features/settings/renderer/components/settings-row'
import { SettingsSection } from '../../../features/settings/renderer/components/settings-section'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '../components/sidebar/sidebar-resize-handle'
import { SidebarSearch } from '../components/sidebar/sidebar-search'
import { AppSidebar } from '../components/sidebar/app-sidebar'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button, buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../components/ui/sidebar'
import { useColorMode } from '../color-mode-provider'
import { i18n } from '../i18n'
import { useSidebarResize } from '../hooks/use-sidebar-resize'
import { useUiLayoutStore } from '../stores/ui-layout-store'

type SettingsSectionId = 'general' | 'models'

type SettingsSearch = {
  section?: SettingsSectionId
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    search.section === 'models' ? { section: 'models' } : {},
  component: SettingsPage
})

const settingsNavigation = [
  { id: 'general', translationKey: 'general', icon: GearSix },
  { id: 'models', translationKey: 'models', icon: Cube }
] as const satisfies ReadonlyArray<{
  id: SettingsSectionId
  translationKey: string
  icon: React.ComponentType<{ className?: string }>
}>

function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { section } = Route.useSearch()
  const selectedSection = section ?? 'general'
  const sidebarWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const setSidebarWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const [languageSettings, setLanguageSettings] = useState<LanguageSettings | null>(null)
  const [languageError, setLanguageError] = useState(false)
  const [themeError, setThemeError] = useState(false)
  const { themePreference, updateThemePreference } = useColorMode()
  const leftSidebarResize = useSidebarResize({ width: sidebarWidth, setWidth: setSidebarWidth })
  const navigationItems = useMemo(
    () =>
      settingsNavigation.map((item) => ({
        ...item,
        label: t(`settings.navigation.${item.translationKey}`)
      })),
    [t]
  )

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getLanguageSettings()
      .then((settings) => {
        if (!isCurrent) return
        setLanguageSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setLanguageError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleLanguagePreferenceChange(preference: LanguagePreference): Promise<void> {
    setLanguageError(false)

    try {
      const settings = await window.spacezero.settings.updateLanguagePreference(preference)
      setLanguageSettings(settings)
      await i18n.changeLanguage(settings.resolvedLanguage)
    } catch {
      setLanguageError(true)
    }
  }

  async function handleThemePreferenceChange(preference: ThemePreference): Promise<void> {
    setThemeError(false)

    try {
      await updateThemePreference(preference)
    } catch {
      setThemeError(true)
    }
  }

  return (
    <div className="flex h-screen min-h-screen bg-background text-foreground">
      <AppSidebar
        className="app-titlebar shrink-0"
        style={{ width: `${sidebarWidth}px` }}
        contentClassName="titlebar-control flex flex-col px-2"
        header={
          <div className="flex h-12 items-center px-3">
            <div className="mac-traffic-light-space shrink-0" />
          </div>
        }
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
            >
              <Cube className="h-4 w-4" aria-hidden="true" />
              {t('settings.upgradeToPro')}
            </Button>
            <div className="mt-3">
              <AccountMenu settingsLabel={t('settings.closeSettings')} />
            </div>
          </>
        }
      >
        <Link
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'mb-5 w-full justify-start gap-2 text-muted-foreground'
          })}
          to="/"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('settings.backToWorkspace')}
        </Link>

        <SidebarSearch
          label={t('settings.search.label')}
          className="mb-5"
          inputClassName="h-9 bg-muted pl-9"
          placeholder={t('settings.search.placeholder')}
        />

        <SidebarMenu aria-label={t('settings.navigationLabel')}>
          {navigationItems.map((item) => {
            const Icon = item.icon

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/settings"
                      search={item.id === 'general' ? {} : { section: item.id }}
                    />
                  }
                  isActive={selectedSection === item.id}
                  className="text-muted-foreground"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </AppSidebar>

      <SidebarResizeHandle
        label={t('workspace.resizeLeftPanel')}
        value={sidebarWidth}
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        className="w-1 bg-background"
        onPointerDown={leftSidebarResize.startResize}
        onKeyDown={leftSidebarResize.resizeWithKeyboard}
      />

      <main
        aria-label={t('settings.mainLabel')}
        className="relative min-h-0 flex-1 overflow-auto bg-background"
      >
        <div className="app-titlebar sticky top-0 z-10 h-12" aria-hidden="true" />
        <div className="mx-auto w-full max-w-[810px] px-8 pb-24 pt-12">
          <h1 className="sr-only">{t('settings.title')}</h1>
          {selectedSection === 'general' ? (
            <GeneralSettingsSection
              languageSettings={languageSettings}
              languageError={languageError}
              themePreference={themePreference}
              themeError={themeError}
              onLanguagePreferenceChange={handleLanguagePreferenceChange}
              onThemePreferenceChange={handleThemePreferenceChange}
            />
          ) : (
            <ModelsSettingsSection />
          )}
        </div>
      </main>
    </div>
  )
}

type GeneralSettingsSectionProps = {
  languageSettings: LanguageSettings | null
  languageError: boolean
  themePreference: ThemePreference
  themeError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
  onThemePreferenceChange: (preference: ThemePreference) => Promise<void>
}

function GeneralSettingsSection({
  languageSettings,
  languageError,
  themePreference,
  themeError,
  onLanguagePreferenceChange,
  onThemePreferenceChange
}: GeneralSettingsSectionProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.general')}</h2>

      <div className="space-y-8">
        <SettingsSection title={t('settings.preferences.sectionTitle')}>
          <SettingsRow
            title={t('settings.language.label')}
            description={t('settings.language.description')}
          >
            <Select
              value={languageSettings?.preference ?? 'system'}
              onValueChange={(value) =>
                void onLanguagePreferenceChange(value as LanguagePreference)
              }
              disabled={!languageSettings}
            >
              <SelectTrigger size="sm" className="w-40" aria-label={t('settings.language.label')}>
                <SelectValue>
                  {(value: LanguagePreference) => getLanguagePreferenceLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.language.useSystem')}</SelectItem>
                <SelectItem value="en">{t('settings.language.english')}</SelectItem>
                <SelectItem value="fr">{t('settings.language.french')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            title={t('settings.theme.label')}
            description={t('settings.theme.description')}
          >
            <Select
              value={themePreference}
              onValueChange={(value) => void onThemePreferenceChange(value as ThemePreference)}
            >
              <SelectTrigger size="sm" className="w-40" aria-label={t('settings.theme.label')}>
                <SelectValue>
                  {(value: ThemePreference) => getThemePreferenceLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.theme.system')}</SelectItem>
                <SelectItem value="light">{t('settings.theme.light')}</SelectItem>
                <SelectItem value="dark">{t('settings.theme.dark')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!languageSettings ? (
            <p className="px-4 pb-3 text-sm text-muted-foreground">
              {t('settings.language.loading')}
            </p>
          ) : null}
          {languageError ? (
            <p className="px-4 pb-3 text-sm text-destructive">{t('settings.language.saveError')}</p>
          ) : null}
          {themeError ? (
            <p className="px-4 pb-3 text-sm text-destructive">{t('settings.theme.saveError')}</p>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )
}

function getLanguagePreferenceLabel(
  preference: LanguagePreference,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (preference === 'system') return t('settings.language.useSystem')
  if (preference === 'fr') return t('settings.language.french')
  return t('settings.language.english')
}

function getThemePreferenceLabel(
  preference: ThemePreference,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (preference === 'system') return t('settings.theme.system')
  if (preference === 'dark') return t('settings.theme.dark')
  return t('settings.theme.light')
}

function ModelsSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [authSettings, setAuthSettings] = useState<ModelAuthSettings | null>(null)
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelDefaults, setModelDefaults] = useState<ModelDefaults | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null)
  const [subscriptionPickerOpen, setSubscriptionPickerOpen] = useState(false)
  const [apiKeyPickerOpen, setApiKeyPickerOpen] = useState(false)
  const [selectedApiKeyProvider, setSelectedApiKeyProvider] = useState<AuthProviderOption | null>(
    null
  )
  const [apiKey, setApiKey] = useState('')
  const [defaultModelPickerOpen, setDefaultModelPickerOpen] = useState(false)
  const [availableModelsOpen, setAvailableModelsOpen] = useState(false)

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
      await window.spacezero.agent.loginOAuth({ providerId: provider.providerId })
      setSubscriptionPickerOpen(false)
      await refreshModelSettings()
    } catch {
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
      await window.spacezero.agent.logoutOAuth({ providerId: provider.providerId })
      await refreshModelSettings()
    } catch {
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
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.models')}</h2>

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

        <AvailableModelsCard
          isLoading={isLoading}
          models={availableModels}
          modelDefaults={modelDefaults}
          open={availableModelsOpen}
          onOpenChange={setAvailableModelsOpen}
          onMakeDefault={(model) => void handleUpdateDefaultModel(model)}
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
    <SettingsSection title={t('settings.models.defaults.sectionTitle')}>
      <Card className="gap-0 py-0">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('settings.models.defaults.loading')}
          </div>
        ) : availableModels.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('settings.models.defaults.empty')}
          </div>
        ) : (
          <>
            {hasUnavailableDefault ? (
              <div className="border-b border-border/70 px-4 py-3 text-sm text-destructive">
                {t('settings.models.defaults.unavailable')}
              </div>
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
      </Card>

      <ModelBrowserDialog
        open={pickerOpen}
        title={t('settings.models.defaults.pickerTitle')}
        description={t('settings.models.defaults.pickerDescription')}
        models={availableModels}
        modelDefaults={modelDefaults}
        actionLabel={t('settings.models.defaults.useAsDefault')}
        onOpenChange={onPickerOpenChange}
        onAction={onSelectDefaultModel}
      />
    </SettingsSection>
  )
}

type AvailableModelsCardProps = {
  isLoading: boolean
  models: AvailableModel[]
  modelDefaults: ModelDefaults | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMakeDefault: (model: AvailableModel) => void
}

function AvailableModelsCard({
  isLoading,
  models,
  modelDefaults,
  open,
  onOpenChange,
  onMakeDefault
}: AvailableModelsCardProps): React.JSX.Element {
  const { t } = useTranslation()
  const providerSummaries = getProviderSummaries(models)

  return (
    <SettingsSection title={t('settings.models.available.sectionTitle')}>
      <Card className="gap-0 py-0">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('settings.models.available.loading')}
          </div>
        ) : models.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('settings.models.available.empty')}
          </div>
        ) : (
          <div className="space-y-4 px-4 py-5">
            <div>
              <p className="text-sm font-medium">
                {t('settings.models.available.summary', {
                  count: models.length,
                  providerCount: providerSummaries.length
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.models.available.summaryDescription')}
              </p>
            </div>
            <div className="space-y-2">
              {providerSummaries.map((provider) => (
                <div
                  key={provider.providerId}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{provider.providerLabel}</span>
                  <span className="text-muted-foreground">
                    {t('settings.models.available.providerCount', { count: provider.count })}
                  </span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
              {t('settings.models.available.browse')}
            </Button>
          </div>
        )}
      </Card>

      <ModelBrowserDialog
        open={open}
        title={t('settings.models.available.browserTitle')}
        description={t('settings.models.available.browserDescription')}
        models={models}
        modelDefaults={modelDefaults}
        actionLabel={t('settings.models.available.makeDefault')}
        onOpenChange={onOpenChange}
        onAction={onMakeDefault}
      />
    </SettingsSection>
  )
}

type ModelBrowserDialogProps = {
  open: boolean
  title: string
  description: string
  models: AvailableModel[]
  modelDefaults: ModelDefaults | null
  actionLabel: string
  onOpenChange: (open: boolean) => void
  onAction: (model: AvailableModel) => void
}

function ModelBrowserDialog({
  open,
  title,
  description,
  models,
  modelDefaults,
  actionLabel,
  onOpenChange,
  onAction
}: ModelBrowserDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const filteredModels = filterModels(models, query)
  const providerGroups = groupModelsByProvider(filteredModels)

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
                <h4 className="text-xs font-medium text-muted-foreground">{group.providerLabel}</h4>
                <div className="space-y-2">
                  {group.models.map((model) => {
                    const isDefault = isSameModel(model, modelDefaults?.defaultModel)

                    return (
                      <div
                        key={`${model.providerId}-${model.modelId}`}
                        className="flex items-center gap-3 rounded-md border px-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{model.modelLabel}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t('settings.models.modelDisplay', {
                              provider: model.providerLabel,
                              model: model.modelId
                            })}
                          </p>
                          {model.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {model.description}
                            </p>
                          ) : null}
                        </div>
                        {isDefault ? (
                          <Badge variant="secondary">
                            {t('settings.models.available.defaultBadge')}
                          </Badge>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => onAction(model)}>
                            {actionLabel}
                          </Button>
                        )}
                      </div>
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

function getProviderSummaries(models: AvailableModel[]): Array<{
  providerId: string
  providerLabel: string
  count: number
}> {
  const summaries = new Map<string, { providerId: string; providerLabel: string; count: number }>()

  for (const model of models) {
    const existing = summaries.get(model.providerId)
    if (existing) {
      existing.count += 1
    } else {
      summaries.set(model.providerId, {
        providerId: model.providerId,
        providerLabel: model.providerLabel,
        count: 1
      })
    }
  }

  return [...summaries.values()].sort((a, b) => a.providerLabel.localeCompare(b.providerLabel))
}

function groupModelsByProvider(models: AvailableModel[]): Array<{
  providerId: string
  providerLabel: string
  models: AvailableModel[]
}> {
  return getProviderSummaries(models).map((provider) => ({
    providerId: provider.providerId,
    providerLabel: provider.providerLabel,
    models: models
      .filter((model) => model.providerId === provider.providerId)
      .sort((a, b) => a.modelLabel.localeCompare(b.modelLabel))
  }))
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
  onAdd,
  onRemove
}: ModelAuthCardProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 px-2">
        <div>
          <h3 className="text-sm text-muted-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
      <Card className="gap-0 py-0">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('settings.models.auth.loading')}
          </div>
        ) : providers.length === 0 ? (
          <div className="flex items-start gap-3 px-4 py-6">
            <div className="rounded-md border p-2 text-muted-foreground">{icon}</div>
            <div>
              <p className="text-sm font-medium">{emptyTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
            </div>
          </div>
        ) : (
          providers.map((provider) => (
            <div
              key={`${provider.providerId}-${provider.source ?? 'unknown'}`}
              className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium leading-5 text-foreground">{provider.label}</p>
                  <Badge variant="outline">{getAuthSourceLabel(provider, t)}</Badge>
                </div>
                <p className="mt-1 text-xs leading-4 text-muted-foreground">
                  {provider.displayLabel ?? t('settings.models.auth.connected')}
                </p>
              </div>
              {provider.removable ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={pendingProviderId === provider.providerId}
                  onClick={() => void onRemove(provider)}
                >
                  <Trash className="h-4 w-4" aria-hidden="true" />
                  {removeLabel}
                </Button>
              ) : (
                <Badge variant="secondary">{t('settings.models.auth.notRemovable')}</Badge>
              )}
            </div>
          ))
        )}
      </Card>
    </section>
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

function getAuthSourceLabel(
  provider: AuthProviderStatus,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (provider.source === 'environment') return t('settings.models.auth.source.environment')
  if (provider.source === 'runtime') return t('settings.models.auth.source.runtime')
  if (provider.source === 'models_json_key' || provider.source === 'models_json_command') {
    return t('settings.models.auth.source.modelConfig')
  }
  return t('settings.models.auth.source.stored')
}
