import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Cube, GearSix } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import type { ThemePreference } from '@shared/theme'
import { AccountMenu } from '../components/app-shell/account-menu'
import { SettingsRow } from '../../../features/settings/renderer/components/settings-row'
import { SettingsSection } from '../../../features/settings/renderer/components/settings-section'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '../components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '../components/sidebar/sidebar-resize-handle'
import { SidebarSearch } from '../components/sidebar/sidebar-search'
import { AppSidebar } from '../components/sidebar/app-sidebar'
import { Button, buttonVariants } from '../components/ui/button'
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
              onValueChange={(value) => void onLanguagePreferenceChange(value as LanguagePreference)}
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
          <SettingsRow title={t('settings.theme.label')} description={t('settings.theme.description')}>
            <Select
              value={themePreference}
              onValueChange={(value) => void onThemePreferenceChange(value as ThemePreference)}
            >
              <SelectTrigger size="sm" className="w-40" aria-label={t('settings.theme.label')}>
                <SelectValue>{(value: ThemePreference) => getThemePreferenceLabel(value, t)}</SelectValue>
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
            <p className="px-4 pb-3 text-sm text-destructive">
              {t('settings.language.saveError')}
            </p>
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
