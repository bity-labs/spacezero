import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Cube, GearSix } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import { AccountMenu } from '../components/app-shell/account-menu'
import { SettingsRow } from '../../../features/settings/renderer/components/settings-row'
import { SettingsSection } from '../../../features/settings/renderer/components/settings-section'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '../components/sidebar/sidebar-resize-handle'
import { SidebarSearch } from '../components/sidebar/sidebar-search'
import { AppSidebar } from '../components/sidebar/app-sidebar'
import { Button, buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '../components/ui/sidebar'
import { Switch } from '../components/ui/switch'
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
              onLanguagePreferenceChange={handleLanguagePreferenceChange}
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
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
}

function GeneralSettingsSection({
  languageSettings,
  languageError,
  onLanguagePreferenceChange
}: GeneralSettingsSectionProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.general')}</h2>

      <div className="space-y-8">
        <Card className="gap-0 py-0">
          <SettingsRow
            title={t('settings.account.title')}
            description={t('settings.account.description')}
          >
            <Button variant="outline" size="sm">
              {t('settings.account.open')}
            </Button>
          </SettingsRow>
          <SettingsRow title={t('settings.pro.title')} description={t('settings.pro.description')}>
            <Button size="sm">{t('settings.pro.upgrade')}</Button>
          </SettingsRow>
        </Card>

        <SettingsSection title={t('settings.pullRequests.sectionTitle')}>
          <SettingsRow
            title={t('settings.pullRequests.reviewProvider.title')}
            description={t('settings.pullRequests.reviewProvider.description')}
          >
            <Select defaultValue="github">
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow
            title={t('settings.pullRequests.linkDestination.title')}
            description={t('settings.pullRequests.linkDestination.description')}
          >
            <Select defaultValue="inside-space-zero">
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inside-space-zero">
                  {t('settings.pullRequests.linkDestination.insideSpaceZero')}
                </SelectItem>
                <SelectItem value="default-browser">
                  {t('settings.pullRequests.linkDestination.defaultBrowser')}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsSection>

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
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t('settings.language.useSystem')}</SelectItem>
                <SelectItem value="en">{t('settings.language.english')}</SelectItem>
                <SelectItem value="fr">{t('settings.language.french')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          {!languageSettings ? (
            <p className="px-4 pb-3 text-sm text-muted-foreground">
              {t('settings.language.loading')}
            </p>
          ) : null}
          {languageError ? (
            <p className="px-4 pb-3 text-sm text-destructive">
              {t('settings.language.saveError')}
            </p>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('settings.notifications.sectionTitle')}>
          <SettingsRow
            title={t('settings.notifications.system.title')}
            description={t('settings.notifications.system.description')}
          >
            <Switch checked aria-label={t('settings.notifications.system.title')} />
          </SettingsRow>
          <SettingsRow
            title={t('settings.notifications.warning.title')}
            description={t('settings.notifications.warning.description')}
          >
            <Switch aria-label={t('settings.notifications.warning.title')} />
          </SettingsRow>
          <SettingsRow
            title={t('settings.notifications.menuBar.title')}
            description={t('settings.notifications.menuBar.description')}
          >
            <Switch checked aria-label={t('settings.notifications.menuBar.title')} />
          </SettingsRow>
          <SettingsRow
            title={t('settings.notifications.completionSound.title')}
            description={t('settings.notifications.completionSound.description')}
          >
            <Switch aria-label={t('settings.notifications.completionSound.title')} />
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  )
}

function ModelsSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.models')}</h2>

      <div className="space-y-8">
        <SettingsSection title={t('settings.models.authentication.sectionTitle')}>
          <SettingsRow
            title={t('settings.models.authentication.subscriptions.title')}
            description={t('settings.models.authentication.subscriptions.description')}
          >
            <Button variant="outline" size="sm" disabled>
              {t('settings.models.comingSoon')}
            </Button>
          </SettingsRow>
          <SettingsRow
            title={t('settings.models.authentication.apiKeys.title')}
            description={t('settings.models.authentication.apiKeys.description')}
          >
            <Button variant="outline" size="sm" disabled>
              {t('settings.models.comingSoon')}
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.models.defaults.sectionTitle')}>
          <SettingsRow
            title={t('settings.models.defaults.title')}
            description={t('settings.models.defaults.description')}
          >
            <Button variant="outline" size="sm" disabled>
              {t('settings.models.comingSoon')}
            </Button>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.models.available.sectionTitle')}>
          <SettingsRow
            title={t('settings.models.available.title')}
            description={t('settings.models.available.description')}
          >
            <Button variant="outline" size="sm" disabled>
              {t('settings.models.comingSoon')}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  )
}
