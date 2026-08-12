import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'

import { AccountMenu } from '@renderer/components/app-shell/account-menu'
import { AppSidebar } from '@renderer/components/sidebar/app-sidebar'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@renderer/components/sidebar/sidebar-layout'
import { SidebarResizeHandle } from '@renderer/components/sidebar/sidebar-resize-handle'
import { buttonVariants } from '@renderer/components/ui/button'
import { useSidebarResize } from '@renderer/hooks/use-sidebar-resize'
import { i18n } from '@renderer/i18n'
import { useUiLayoutStore } from '@renderer/stores/ui-layout-store'
import { AboutSettingsPage } from './pages/about-settings-page'
import { AccountSettingsPage } from './pages/account-settings-page'
import { AgentsSettingsPage } from './pages/agents-settings-page'
import { AppearanceSettingsPage } from './pages/appearance-settings-page'
import { GeneralSettingsPage } from './pages/general-settings-page'
import { ProvidersSettingsPage } from './pages/providers-settings-page'
import { SkillsSettingsPage } from './pages/skills-settings-page'
import { UiDebugSettingsPage } from './pages/ui-debug-settings-page'
import { SettingsNavigation, type SettingsSectionId } from './settings-navigation'

export function SettingsLayout({
  selectedSection
}: {
  selectedSection: SettingsSectionId
}): React.JSX.Element {
  const { t } = useTranslation()
  const sidebarWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const setSidebarWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const [languageSettings, setLanguageSettings] = useState<LanguageSettings | null>(null)
  const [languageError, setLanguageError] = useState(false)
  const leftSidebarResize = useSidebarResize({ width: sidebarWidth, setWidth: setSidebarWidth })

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

        <SettingsNavigation selectedSection={selectedSection} />
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
          <SelectedSettingsPage
            selectedSection={selectedSection}
            languageSettings={languageSettings}
            languageError={languageError}
            onLanguagePreferenceChange={handleLanguagePreferenceChange}
          />
        </div>
      </main>
    </div>
  )
}

function SelectedSettingsPage({
  selectedSection,
  languageSettings,
  languageError,
  onLanguagePreferenceChange
}: {
  selectedSection: SettingsSectionId
  languageSettings: LanguageSettings | null
  languageError: boolean
  onLanguagePreferenceChange: (preference: LanguagePreference) => Promise<void>
}): React.JSX.Element {
  switch (selectedSection) {
    case 'account':
      return <AccountSettingsPage />
    case 'general':
      return (
        <GeneralSettingsPage
          languageSettings={languageSettings}
          languageError={languageError}
          onLanguagePreferenceChange={onLanguagePreferenceChange}
        />
      )
    case 'skills':
      return <SkillsSettingsPage />
    case 'agents':
      return <AgentsSettingsPage />
    case 'appearance':
      return <AppearanceSettingsPage />
    case 'about':
      return <AboutSettingsPage />
    case 'debug':
      return <UiDebugSettingsPage />
    case 'models':
      return <ProvidersSettingsPage />
  }
}
