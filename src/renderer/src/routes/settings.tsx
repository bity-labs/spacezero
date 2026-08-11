import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  Cube,
  FolderOpen,
  GearSix,
  Info,
  Key,
  Plus,
  Plugs,
  Sparkle,
  Trash,
  UserCircle
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { ChatLinkDestination, ChatLinkSettings } from '@shared/chat-link-settings'
import type { GitActionSettings, GitComposerAction } from '@shared/git-action-settings'
import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { AuthProviderOption, AuthProviderStatus, ModelAuthSettings } from '@shared/model-auth'
import type { AvailableModel, ModelDefaults, ThinkingLevel } from '@shared/model-settings'
import { THINKING_LEVELS } from '@shared/model-settings'
import type { ThemePreference } from '@shared/theme'
import type { StorageSettings } from '@shared/storage-settings'
import type { TerminalSettings } from '@shared/terminal-settings'
import type { UpdateStatus } from '../../../features/updates/shared'
import { UpdateRestartControl } from '../../../features/updates/renderer'
import type { AgentGlobalSkill } from '../../../features/agent-workspace/shared/agent-skill.model'
import { AgentsSettingsSection } from '../../../features/agents/renderer'
import { AccountSettings } from '../../../features/github/renderer'
import { AccountMenu } from '../components/app-shell/account-menu'
import { SettingsPageHeader } from '../../../features/settings/renderer/components/settings-page-header'
import { SettingsRow } from '../../../features/settings/renderer/components/settings-row'
import { SettingsSection } from '../../../features/settings/renderer/components/settings-section'
import { UiDebugPage } from '../../../features/settings/renderer/components/ui-debug-page'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '../components/sidebar/sidebar-resize-handle'
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
import { Switch } from '../components/ui/switch'
import { Text } from '../components/ui/typography'
import { useColorMode } from '../color-mode-provider'
import { i18n } from '../i18n'
import { useSidebarResize } from '../hooks/use-sidebar-resize'
import { useUiLayoutStore } from '../stores/ui-layout-store'

type SettingsSectionId =
  | 'general'
  | 'models'
  | 'account'
  | 'appearance'
  | 'about'
  | 'agents'
  | 'skills'
  | 'debug'

type SettingsSearch = {
  section?: SettingsSectionId
}

export const Route = createFileRoute('/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch =>
    search.section === 'account' ||
    search.section === 'models' ||
    search.section === 'account' ||
    search.section === 'appearance' ||
    search.section === 'about' ||
    search.section === 'agents' ||
    search.section === 'skills' ||
    search.section === 'debug'
      ? { section: search.section }
      : {},
  component: SettingsPage
})

const primarySettingsNavigation = [
  { id: 'general', translationKey: 'general', icon: GearSix },
  { id: 'models', translationKey: 'models', icon: Cube },
  { id: 'account', translationKey: 'account', icon: UserCircle },
  { id: 'appearance', translationKey: 'appearance', icon: GearSix },
  { id: 'about', translationKey: 'about', icon: Info }
] as const satisfies ReadonlyArray<{
  id: SettingsSectionId
  translationKey: string
  icon: React.ComponentType<{ className?: string }>
}>

const secondarySettingsNavigation = [
  { id: 'agents', translationKey: 'agents', icon: UserCircle },
  { id: 'skills', translationKey: 'skills', icon: Sparkle },
  { id: 'debug', translationKey: 'debug', icon: GearSix }
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
  const primaryNavigationItems = useMemo(
    () => primarySettingsNavigation.map((item) => ({ ...item, label: getSettingsNavLabel(item, t) })),
    [t]
  )
  const secondaryNavigationItems = useMemo(
    () => secondarySettingsNavigation.map((item) => ({ ...item, label: getSettingsNavLabel(item, t) })),
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
        footer={<AccountMenu settingsLabel={t('settings.closeSettings')} />}
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

        <SidebarMenu aria-label={t('settings.navigationLabel')}>
          {primaryNavigationItems.map((item) => (
            <SettingsNavigationItem key={item.id} item={item} selectedSection={selectedSection} />
          ))}
        </SidebarMenu>

        <div className="my-4 border-t border-sidebar-border" />

        <SidebarMenu aria-label="Experimental settings">
          {secondaryNavigationItems.map((item) => (
            <SettingsNavigationItem key={item.id} item={item} selectedSection={selectedSection} />
          ))}
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
          {selectedSection === 'account' ? (
            <AccountSettingsSection />
          ) : selectedSection === 'general' ? (
            <GeneralSettingsSection
              languageSettings={languageSettings}
              languageError={languageError}
              themePreference={themePreference}
              themeError={themeError}
              onLanguagePreferenceChange={handleLanguagePreferenceChange}
              onThemePreferenceChange={handleThemePreferenceChange}
            />
          ) : selectedSection === 'skills' ? (
            <SkillsSettingsSection />
          ) : selectedSection === 'agents' ? (
            <AgentsSettingsSection />
          ) : selectedSection === 'appearance' ? (
            <AppearanceSettingsSection />
          ) : selectedSection === 'about' ? (
            <AboutSettingsSection />
          ) : selectedSection === 'debug' ? (
            <UiDebugPage />
          ) : (
            <ModelsSettingsSection />
          )}
        </div>
      </main>
    </div>
  )
}

type SettingsNavigationEntry = {
  id: SettingsSectionId
  translationKey: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

function getSettingsNavLabel(
  item: { id: SettingsSectionId; translationKey: string },
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (item.id === 'appearance') return 'Appearance'
  if (item.id === 'debug') return 'UI Debug'
  return t(`settings.navigation.${item.translationKey}`)
}

function SettingsNavigationItem({
  item,
  selectedSection
}: {
  item: SettingsNavigationEntry
  selectedSection: SettingsSectionId
}): React.JSX.Element {
  const Icon = item.icon

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <Link to="/settings" search={item.id === 'general' ? {} : { section: item.id }} />
        }
        isActive={selectedSection === item.id}
        className="text-muted-foreground"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function getUpdateStateLabel(
  status: UpdateStatus | null,
  t: ReturnType<typeof useTranslation>['t'],
  loadError: boolean
): string {
  if (loadError) return t('settings.about.states.error')
  if (!status) return t('settings.about.loading')

  return t(`settings.about.states.${status.state}`)
}

function formatUpdateCheckedAt(
  lastCheckedAt: string | null | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (!lastCheckedAt) return t('settings.about.neverChecked')

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(lastCheckedAt))
}

function AppearanceSettingsSection(): React.JSX.Element {
  return (
    <>
      <h2 className="mb-2 text-xl font-medium">Appearance</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Theme and typography settings will live here.
      </p>
    </>
  )
}

function AccountSettingsSection(): React.JSX.Element {
  return (
    <>
      <h2 className="mb-6 text-xl font-medium">Account</h2>
      <div className="space-y-8">
        <section aria-labelledby="github-account-heading" className="space-y-3">
          <div className="px-2">
            <h3 id="github-account-heading" className="text-sm text-muted-foreground">
              GitHub
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              GitHub is optional. Local Projects continue to work without a connection.
            </p>
          </div>
          <AccountSettings />
        </section>
      </div>
    </>
  )
}

function AboutSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const isChecking = updateStatus?.state === 'checking'

  useEffect(() => {
    let isCurrent = true
    const unsubscribe = window.spacezero.update.onStatusChange((status) => {
      if (!isCurrent) return
      setLoadError(false)
      setUpdateStatus(status)
    })

    window.spacezero.update
      .getStatus()
      .then((status) => {
        if (!isCurrent) return
        setUpdateStatus(status)
      })
      .catch(() => {
        if (!isCurrent) return
        setLoadError(true)
      })

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  async function handleCheckForUpdates(): Promise<void> {
    setLoadError(false)
    setUpdateStatus((status) =>
      status ? { ...status, state: 'checking', errorMessage: null } : status
    )

    try {
      const status = await window.spacezero.update.checkForUpdates()
      setUpdateStatus(status)
    } catch {
      setLoadError(true)
    }
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.about.title')}</h2>
      <div className="space-y-8">
        <SettingsSection title={t('settings.about.updatesSectionTitle')}>
          <div className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t('settings.about.versionLabel')}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {updateStatus?.currentVersion ?? t('settings.about.loading')}
                </p>
              </div>
              {updateStatus ? (
                <Badge variant="secondary">{t('settings.about.betaChannel')}</Badge>
              ) : null}
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('settings.about.updateStateLabel')}</dt>
                <dd className="mt-1 font-medium">
                  {getUpdateStateLabel(updateStatus, t, loadError)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('settings.about.lastCheckedLabel')}</dt>
                <dd className="mt-1 font-medium">
                  {formatUpdateCheckedAt(updateStatus?.lastCheckedAt, t)}
                </dd>
              </div>
              {updateStatus?.availableVersion ? (
                <div>
                  <dt className="text-muted-foreground">
                    {t('settings.about.availableVersionLabel')}
                  </dt>
                  <dd className="mt-1 font-medium">{updateStatus.availableVersion}</dd>
                </div>
              ) : null}
              {updateStatus?.downloadedVersion ? (
                <div>
                  <dt className="text-muted-foreground">
                    {t('settings.about.downloadedVersionLabel')}
                  </dt>
                  <dd className="mt-1 font-medium">{updateStatus.downloadedVersion}</dd>
                </div>
              ) : null}
            </dl>

            {loadError || updateStatus?.state === 'error' ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {updateStatus?.errorMessage ?? t('settings.about.loadError')}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <UpdateRestartControl placement="settings" />
              <Button onClick={() => void handleCheckForUpdates()} disabled={isChecking}>
                {isChecking ? t('settings.about.checkingAction') : t('settings.about.checkAction')}
              </Button>
              <a
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                href={
                  updateStatus?.releaseNotesUrl ?? 'https://github.com/bity-labs/spacezero/releases'
                }
                target="_blank"
                rel="noreferrer"
              >
                {t('settings.about.releaseNotesAction')}
              </a>
            </div>
          </div>
        </SettingsSection>
      </div>
    </>
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
  const [chatLinkSettings, setChatLinkSettings] = useState<ChatLinkSettings | null>(null)
  const [chatLinkError, setChatLinkError] = useState(false)
  const [gitActionSettings, setGitActionSettings] = useState<GitActionSettings | null>(null)
  const [gitActionError, setGitActionError] = useState(false)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getChatLinkSettings()
      .then((settings) => {
        if (!isCurrent) return
        setChatLinkSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setChatLinkError(true)
      })

    window.spacezero.settings
      .getGitActionSettings()
      .then((settings) => {
        if (!isCurrent) return
        setGitActionSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setGitActionError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleChatLinkDestinationChange(destination: ChatLinkDestination): Promise<void> {
    setChatLinkError(false)

    try {
      const settings = await window.spacezero.settings.updateChatLinkSettings({
        openChatLinksIn: destination
      })
      setChatLinkSettings(settings)
    } catch {
      setChatLinkError(true)
    }
  }

  async function handleGitActionChange(primaryGitAction: GitComposerAction): Promise<void> {
    setGitActionError(false)

    try {
      const settings = await window.spacezero.settings.updateGitActionSettings({
        primaryGitAction
      })
      setGitActionSettings(settings)
    } catch {
      setGitActionError(true)
    }
  }

  return (
    <>
      <SettingsPageHeader title={t('settings.navigation.general')} />

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
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.language.loading')}
            </Text>
          ) : null}
          {languageError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.language.saveError')}
            </Text>
          ) : null}
          {themeError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.theme.saveError')}
            </Text>
          ) : null}
          <SettingsRow
            title={t('settings.chatLinks.label')}
            description={t('settings.chatLinks.description')}
          >
            <Select
              value={chatLinkSettings?.openChatLinksIn ?? 'space-zero-browser'}
              onValueChange={(value) =>
                void handleChatLinkDestinationChange(value as ChatLinkDestination)
              }
              disabled={!chatLinkSettings}
            >
              <SelectTrigger size="sm" className="w-48" aria-label={t('settings.chatLinks.label')}>
                <SelectValue>
                  {(value: ChatLinkDestination) => getChatLinkDestinationLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="space-zero-browser">
                  {t('settings.chatLinks.spaceZeroBrowser')}
                </SelectItem>
                <SelectItem value="default-browser">
                  {t('settings.chatLinks.defaultBrowser')}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!chatLinkSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.chatLinks.loading')}
            </Text>
          ) : null}
          {chatLinkError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.chatLinks.saveError')}
            </Text>
          ) : null}
          <SettingsRow
            title={t('settings.gitPrimaryAction.label')}
            description={t('settings.gitPrimaryAction.description')}
          >
            <Select
              value={gitActionSettings?.primaryGitAction ?? 'commit-and-push'}
              onValueChange={(value) => void handleGitActionChange(value as GitComposerAction)}
              disabled={!gitActionSettings}
            >
              <SelectTrigger
                size="sm"
                className="w-44"
                aria-label={t('settings.gitPrimaryAction.label')}
              >
                <SelectValue>
                  {(value: GitComposerAction) => getGitActionLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commit">{t('settings.gitPrimaryAction.commit')}</SelectItem>
                <SelectItem value="commit-and-push">
                  {t('settings.gitPrimaryAction.commitAndPush')}
                </SelectItem>
                <SelectItem value="commit-and-create-pr">
                  {t('settings.gitPrimaryAction.commitAndCreatePr')}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!gitActionSettings ? (
            <Text variant="muted" className="px-4 pb-3">
              {t('settings.gitPrimaryAction.loading')}
            </Text>
          ) : null}
          {gitActionError ? (
            <Text variant="danger" className="px-4 pb-3">
              {t('settings.gitPrimaryAction.saveError')}
            </Text>
          ) : null}
        </SettingsSection>

        <StorageSettingsSection />

        <TerminalSafetySettingsSection />

        <BrowserDataSettingsSection />


      </div>
    </>
  )
}

function BrowserDataSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function confirmClearBrowserData(): Promise<void> {
    if (isClearing) return
    setIsClearing(true)
    setMessage(null)

    try {
      const result = await window.spacezero.browser.clearData()
      setIsConfirmOpen(false)
      if (result.status === 'cleared') {
        setMessage({ kind: 'success', text: t('settings.browserData.success') })
      } else {
        const failedCategories = result.failures
          .map((failure) => browserDataCategoryLabel(failure.category, t))
          .join(', ')
        setMessage({
          kind: 'error',
          text: t('settings.browserData.failure', { categories: failedCategories })
        })
      }
    } catch {
      setMessage({ kind: 'error', text: t('settings.browserData.unexpectedFailure') })
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <SettingsSection title={t('settings.browserData.sectionTitle')}>
      <SettingsRow
        title={t('settings.browserData.clearAction')}
        description={t('settings.browserData.description')}
      >
        <Button
          variant="destructive"
          size="sm"
          disabled={isClearing}
          onClick={() => setIsConfirmOpen(true)}
        >
          {isClearing ? t('settings.browserData.clearing') : t('settings.browserData.clearAction')}
        </Button>
      </SettingsRow>
      {message ? (
        <Text
          role="status"
          variant={message.kind === 'error' ? 'danger' : 'muted'}
          className="px-4 pb-3"
        >
          {message.text}
        </Text>
      ) : null}
      <Dialog open={isConfirmOpen} onOpenChange={(open) => !isClearing && setIsConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.browserData.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('settings.browserData.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isClearing} onClick={() => setIsConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={isClearing}
              onClick={() => void confirmClearBrowserData()}
            >
              {isClearing
                ? t('settings.browserData.clearing')
                : t('settings.browserData.confirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  )
}

function TerminalSafetySettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null)
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getTerminalSettings()
      .then((settings) => {
        if (!isCurrent) return
        setTerminalSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function updateConfirmBeforeClosingLiveTerminals(nextValue: boolean): Promise<void> {
    if (!terminalSettings || isChanging) return
    setIsChanging(true)
    setError(false)
    try {
      const updated = await window.spacezero.settings.updateTerminalSettings({
        confirmBeforeClosingLiveTerminals: nextValue
      })
      setTerminalSettings(updated)
    } catch {
      setError(true)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <SettingsSection title={t('settings.terminal.sectionTitle')}>
      <SettingsRow
        title={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
        description={t('settings.terminal.confirmBeforeClosingLiveTerminals.description')}
      >
        <Switch
          aria-label={t('settings.terminal.confirmBeforeClosingLiveTerminals.label')}
          checked={terminalSettings?.confirmBeforeClosingLiveTerminals ?? true}
          disabled={!terminalSettings || isChanging}
          onCheckedChange={(checked) =>
            void updateConfirmBeforeClosingLiveTerminals(Boolean(checked))
          }
        />
      </SettingsRow>
      {!terminalSettings ? (
        <Text variant="muted" className="px-4 pb-3">
          {t('settings.terminal.loading')}
        </Text>
      ) : null}
      {error ? (
        <Text variant="danger" className="px-4 pb-3">
          {t('settings.terminal.saveError')}
        </Text>
      ) : null}
    </SettingsSection>
  )
}

function StorageSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null)
  const [isChanging, setIsChanging] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getStorageSettings()
      .then((settings) => {
        if (!isCurrent) return
        setStorageSettings(settings)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleChooseSpaceZeroHome(): Promise<void> {
    setIsChanging(true)
    setError(false)

    try {
      const nextSettings = await window.spacezero.settings.chooseSpaceZeroHome()
      if (nextSettings) setStorageSettings(nextSettings)
    } catch {
      setError(true)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <SettingsSection title={t('settings.storage.sectionTitle')}>
      <SettingsRow
        title={t('settings.storage.spaceZeroHome')}
        description={t('settings.storage.spaceZeroHomeDescription')}
      >
        <div className="flex max-w-[360px] items-center gap-3">
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={storageSettings?.spaceZeroHome}
          >
            {storageSettings?.spaceZeroHome ?? t('settings.storage.loading')}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            disabled={!storageSettings || isChanging}
            aria-label={isChanging ? t('settings.storage.changing') : t('settings.storage.change')}
            onClick={() => void handleChooseSpaceZeroHome()}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </SettingsRow>
      {error ? (
        <Text variant="danger" className="px-4 pb-3">
          {t('settings.storage.error')}
        </Text>
      ) : null}
    </SettingsSection>
  )
}

function SkillsSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<AgentGlobalSkill[] | null>(null)
  const [error, setError] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [skillSearchQuery, setSkillSearchQuery] = useState('')
  const updatePendingRef = useRef(false)
  const filteredSkills = useMemo(() => {
    if (skills === null) return null

    const normalizedQuery = skillSearchQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery) return skills

    return skills.filter((skill) => skill.name.toLocaleLowerCase().includes(normalizedQuery))
  }, [skillSearchQuery, skills])

  useEffect(() => {
    let isCurrent = true

    window.spacezero.agent
      .getGlobalSkills()
      .then((globalSkills) => {
        if (!isCurrent) return
        setSkills(globalSkills)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleSkillEnabledChange(
    skill: AgentGlobalSkill,
    enabled: boolean
  ): Promise<void> {
    if (updatePendingRef.current) return

    updatePendingRef.current = true
    setPendingPath(skill.path)
    setError(false)

    try {
      const nextSkills = await window.spacezero.agent.setGlobalSkillEnabled({
        path: skill.path,
        enabled
      })
      setSkills(nextSkills)
    } catch {
      setError(true)
    } finally {
      updatePendingRef.current = false
      setPendingPath(null)
    }
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.skills')}</h2>
      <div className="space-y-8">
        <SettingsSection
          title={t('settings.skills.sectionTitle')}
          description={t('settings.skills.description')}
          footer={
            <p className="text-xs text-orange-600 dark:text-orange-400">
              {t('settings.skills.applyNote')}
            </p>
          }
        >
          {skills === null ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t('settings.skills.loading')}
            </p>
          ) : skills.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('settings.skills.empty')}</p>
          ) : (
            <>
              <div className="px-4 py-4">
                <Input
                  type="search"
                  value={skillSearchQuery}
                  aria-label={t('settings.skills.searchLabel')}
                  placeholder={t('settings.skills.searchPlaceholder')}
                  onChange={(event) => setSkillSearchQuery(event.target.value)}
                />
              </div>
              {filteredSkills?.length === 0 ? (
                <p className="border-t border-border/70 px-4 py-4 text-sm text-muted-foreground">
                  {t('settings.skills.noSearchResults')}
                </p>
              ) : (
                filteredSkills?.map((skill) => (
                  <div
                    key={skill.path}
                    className="flex items-center gap-4 border-t border-border/70 px-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{skill.name}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                          {skill.scope}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{skill.description}</p>
                      <p
                        className="mt-2 truncate text-[11px] text-muted-foreground"
                        title={skill.path}
                      >
                        {t('settings.skills.path', { path: skill.path })}
                      </p>
                    </div>
                    <Switch
                      checked={skill.enabled}
                      disabled={pendingPath !== null}
                      aria-label={t(
                        skill.enabled ? 'settings.skills.disable' : 'settings.skills.enable',
                        { name: skill.name }
                      )}
                      onCheckedChange={(enabled) => void handleSkillEnabledChange(skill, enabled)}
                    />
                  </div>
                ))
              )}
            </>
          )}
          {error ? (
            <p className="px-4 pb-4 text-sm text-destructive">{t('settings.skills.error')}</p>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )
}

function browserDataCategoryLabel(
  category: 'cookies-and-site-storage' | 'cache' | 'temporary-grants',
  t: (key: string) => string
): string {
  switch (category) {
    case 'cookies-and-site-storage':
      return t('settings.browserData.categories.cookiesAndSiteStorage')
    case 'cache':
      return t('settings.browserData.categories.cache')
    case 'temporary-grants':
      return t('settings.browserData.categories.temporaryGrants')
  }
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

function getChatLinkDestinationLabel(
  destination: ChatLinkDestination,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (destination === 'default-browser') return t('settings.chatLinks.defaultBrowser')
  return t('settings.chatLinks.spaceZeroBrowser')
}

function getGitActionLabel(
  action: GitComposerAction,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (action === 'commit') return t('settings.gitPrimaryAction.commit')
  if (action === 'commit-and-create-pr') {
    return t('settings.gitPrimaryAction.commitAndCreatePr')
  }
  return t('settings.gitPrimaryAction.commitAndPush')
}

function ModelsSettingsSection(): React.JSX.Element {
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
  const [authTestResults, setAuthTestResults] = useState<Record<string, string>>({})
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
      setAuthTestResults((results) => {
        const { [selectedApiKeyProvider.providerId]: _removed, ...remainingResults } = results
        return remainingResults
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
      setAuthTestResults((results) => {
        const { [provider.providerId]: _removed, ...remainingResults } = results
        return remainingResults
      })
      await refreshModelSettings()
    } catch {
      setError(t('settings.models.apiKeys.removeError'))
    } finally {
      setPendingProviderId(null)
    }
  }

  async function handleTestAuth(provider: AuthProviderStatus): Promise<void> {
    setPendingProviderId(provider.providerId)
    setError(null)

    try {
      const result = await window.spacezero.agent.testAuth({ providerId: provider.providerId })
      setAuthTestResults((results) => ({
        ...results,
        [provider.providerId]: result.ok
          ? t('settings.models.auth.testSuccess')
          : result.message || t('settings.models.auth.testFailed')
      }))
    } catch {
      setAuthTestResults((results) => ({
        ...results,
        [provider.providerId]: t('settings.models.auth.testFailed')
      }))
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
          onTestAuth={(provider) => void handleTestAuth(provider)}
          testResults={authTestResults}
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
  statusMessage?: string | null
  addDisabled?: boolean
  disabledReason?: string
  onAdd: () => void
  onRemove: (provider: AuthProviderStatus) => Promise<void>
  onTestAuth?: (provider: AuthProviderStatus) => void
  testResults?: Record<string, string>
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
  onRemove,
  onTestAuth,
  testResults = {}
}: ModelAuthCardProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 px-2">
        <div>
          <h3 className="text-sm text-muted-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {disabledReason ? <Badge variant="secondary">{disabledReason}</Badge> : null}
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
        </div>
      </div>
      <Card className="gap-0 py-0">
        {statusMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-border/70 px-4 py-3 text-sm text-muted-foreground"
          >
            {statusMessage}
          </div>
        ) : null}
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
                {testResults[provider.providerId] ? (
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">
                    {testResults[provider.providerId]}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {onTestAuth ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingProviderId === provider.providerId}
                    onClick={() => onTestAuth(provider)}
                  >
                    {t('settings.models.auth.test')}
                  </Button>
                ) : null}
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
