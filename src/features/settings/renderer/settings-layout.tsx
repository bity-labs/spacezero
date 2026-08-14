import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'

import { AccountMenu } from '@renderer/components/app-shell/account-menu'
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
import { SettingsLayoutView, type SettingsLayoutViewLabels } from './settings-layout-view'
import type { SettingsSectionId } from './settings-navigation'

export function SettingsLayout({
  selectedSection
}: {
  selectedSection: SettingsSectionId
}): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
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

  const labels: SettingsLayoutViewLabels = {
    backToWorkspace: t('settings.backToWorkspace'),
    navigation: t('settings.navigationLabel'),
    experimentalNavigation: 'Experimental settings',
    main: t('settings.mainLabel'),
    title: t('settings.title'),
    resizeSidebar: t('workspace.resizeLeftPanel'),
    sections: {
      general: t('settings.navigation.general'),
      models: t('settings.navigation.models'),
      account: t('settings.navigation.account'),
      appearance: 'Appearance',
      about: t('settings.navigation.about'),
      agents: t('settings.navigation.agents'),
      skills: t('settings.navigation.skills')
    }
  }

  return (
    <SettingsLayoutView
      sidebarWidth={sidebarWidth}
      selectedSection={selectedSection}
      accountMenu={<AccountMenu settingsLabel={t('settings.closeSettings')} />}
      mainContent={
        <SelectedSettingsPage
          selectedSection={selectedSection}
          languageSettings={languageSettings}
          languageError={languageError}
          onLanguagePreferenceChange={handleLanguagePreferenceChange}
        />
      }
      labels={labels}
      onBackToWorkspace={() => void navigate({ to: '/' })}
      onSelectSection={(section) =>
        void navigate({
          to: '/settings',
          search: section === 'general' ? {} : { section }
        })
      }
      onResizePointerDown={leftSidebarResize.startResize}
      onResizeKeyDown={leftSidebarResize.resizeWithKeyboard}
    />
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
    case 'models':
      return <ProvidersSettingsPage />
  }
}
