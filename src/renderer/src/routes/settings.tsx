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

import type { FontFamilyPreference, ThemePreference } from '@shared/appearance-settings'
import type { ChatLinkDestination, ChatLinkSettings } from '@shared/chat-link-settings'
import type { GitActionSettings, GitComposerAction } from '@shared/git-action-settings'
import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { AuthProviderOption, AuthProviderStatus, ModelAuthSettings } from '@shared/model-auth'
import type { AvailableModel, ModelDefaults, ThinkingLevel } from '@shared/model-settings'
import { THINKING_LEVELS } from '@shared/model-settings'
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
import { EmptyState } from '../components/ui/empty'
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
import { useAppearance } from '../appearance-provider'
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
              onLanguagePreferenceChange={handleLanguagePreferenceChange}
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
  const { t } = useTranslation()
  const { themePreference, fontFamily, thinFontAntialiasing, updateAppearanceSettings } =
    useAppearance()
  const [appearanceError, setAppearanceError] = useState(false)

  async function handleThemePreferenceChange(preference: ThemePreference): Promise<void> {
    setAppearanceError(false)

    try {
      await updateAppearanceSettings({ themePreference: preference })
    } catch {
      setAppearanceError(true)
    }
  }

  async function handleFontFamilyChange(fontFamily: FontFamilyPreference): Promise<void> {
    setAppearanceError(false)

    try {
      await updateAppearanceSettings({ fontFamily })
    } catch {
      setAppearanceError(true)
    }
  }

  async function handleThinFontAntialiasingChange(thinFontAntialiasing: boolean): Promise<void> {
    setAppearanceError(false)

    try {
      await updateAppearanceSettings({ thinFontAntialiasing })
    } catch {
      setAppearanceError(true)
    }
  }

  return (
    <>
      <SettingsPageHeader title="Appearance" />
      <div className="space-y-8">
        <SettingsSection>
          <SettingsRow title={t('settings.theme.label')} description={t('settings.theme.description')}>
            <Select
              value={themePreference}
              onValueChange={(value) => void handleThemePreferenceChange(value as ThemePreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label={t('settings.theme.label')}>
                <SelectValue>
                  {(value: ThemePreference) => getThemePreferenceLabel(value, t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.theme.system')}</SelectItem>
                <SelectItem value="light">{t('settings.theme.light')}</SelectItem>
                <SelectItem value="dark">{t('settings.theme.dark')}</SelectItem>
                <SelectItem value="dark-high-contrast">Dark high contrast</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow title="Font" description="Choose the interface typeface.">
            <Select
              value={fontFamily}
              onValueChange={(value) => void handleFontFamilyChange(value as FontFamilyPreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label="Font">
                <SelectValue>{(value: FontFamilyPreference) => getFontFamilyLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System font</SelectItem>
                <SelectItem value="geist">Geist</SelectItem>
                <SelectItem value="sf-pro">SF Pro Text</SelectItem>
                <SelectItem value="inter">Inter</SelectItem>
                <SelectItem value="helvetica">Helvetica Neue</SelectItem>
                <SelectItem value="arial">Arial</SelectItem>
                <SelectItem value="sf-mono">SF Mono</SelectItem>
                <SelectItem value="menlo">Menlo</SelectItem>
                <SelectItem value="monaco">Monaco</SelectItem>
                <SelectItem value="jetbrains-mono">JetBrains Mono</SelectItem>
                <SelectItem value="monospace">Generic monospace</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            title="Use thin font anti-aliasing"
            description="Use thinner browser-style font rendering."
          >
            <Switch
              checked={thinFontAntialiasing}
              onCheckedChange={(checked) => void handleThinFontAntialiasingChange(Boolean(checked))}
            />
          </SettingsRow>
          {appearanceError ? (
            <Text variant="danger" className="px-4 pb-3">
              Could not update appearance settings.
            </Text>
          ) : null}
        </SettingsSection>
      </div>
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
      <SettingsPageHeader title={t('settings.about.title')} />
      <div className="space-y-8">
        <SettingsSection>
          <SettingsRow
            title={t('settings.about.versionLabel')}
            description={updateStatus?.currentVersion ?? t('settings.about.loading')}
          >
            {null}
          </SettingsRow>
          <SettingsRow
            title={t('settings.about.updateStateLabel')}
            description={getUpdateStateLabel(updateStatus, t, loadError)}
          >
            <div className="flex items-center gap-2">
              {updateStatus?.availableVersion ? (
                <Badge variant="outline">{updateStatus.availableVersion}</Badge>
              ) : null}
              <UpdateRestartControl placement="settings" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCheckForUpdates()}
                disabled={isChecking}
              >
                {isChecking ? t('settings.about.checkingAction') : t('settings.about.checkAction')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow
            title={t('settings.about.lastCheckedLabel')}
            description={formatUpdateCheckedAt(updateStatus?.lastCheckedAt, t)}
          >
            {updateStatus?.downloadedVersion ? (
              <Badge variant="outline">{updateStatus.downloadedVersion}</Badge>
            ) : null}
          </SettingsRow>
          {loadError || updateStatus?.state === 'error' ? (
            <div className="border-t border-border/70 p-4">
              <Alert variant="destructive">
                <AlertDescription>
                  {updateStatus?.errorMessage ?? t('settings.about.loadError')}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )

}

type GeneralSettingsSectionProps = {
  languageSettings: LanguageSettings | null
  languageError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
}

function GeneralSettingsSection({
  languageSettings,
  languageError,
  onLanguagePreferenceChange
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
  if (preference === 'dark-high-contrast') return 'Dark high contrast'
  return t('settings.theme.light')
}

function getFontFamilyLabel(fontFamily: FontFamilyPreference): string {
  switch (fontFamily) {
    case 'system':
      return 'System font'
    case 'geist':
      return 'Geist'
    case 'sf-pro':
      return 'SF Pro Text'
    case 'inter':
      return 'Inter'
    case 'helvetica':
      return 'Helvetica Neue'
    case 'arial':
      return 'Arial'
    case 'sf-mono':
      return 'SF Mono'
    case 'menlo':
      return 'Menlo'
    case 'monaco':
      return 'Monaco'
    case 'jetbrains-mono':
      return 'JetBrains Mono'
    case 'monospace':
      return 'Generic monospace'
  }
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

  return <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">{content}</div>
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
  const groups = new Map<string, { providerId: string; providerLabel: string; models: AvailableModel[] }>()

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
            <Button variant="outline" size="sm" className="gap-2" disabled={addDisabled} onClick={onAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {addLabel}
            </Button>
            {disabledReason ? <Badge variant="secondary">{disabledReason}</Badge> : null}
          </div>
        ) : null
      }
    >
      {statusMessage ? (
        <Text role="status" aria-live="polite" variant="muted" className="border-b border-border/70 px-4 py-3">
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
            <Button variant="outline" size="sm" className="gap-2" disabled={addDisabled} onClick={onAdd}>
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

