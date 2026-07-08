import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  Cloud,
  Cube,
  GearSix,
  PaintBrush,
  PaperPlaneTilt,
  UserCircle
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import { AccountMenu } from '../components/app-shell/account-menu'
import { SettingsRow } from '../components/settings/settings-row'
import { SettingsSection } from '../components/settings/settings-section'
import {
  SIDEBAR_KEYBOARD_RESIZE_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth
} from '../components/sidebar/sidebar-layout'
import { SidebarNavItem } from '../components/sidebar/sidebar-nav-item'
import { SidebarResizeHandle } from '../components/sidebar/sidebar-resize-handle'
import { SidebarSearch } from '../components/sidebar/sidebar-search'
import { AppSidebar } from '../components/sidebar/app-sidebar'
import { Button, buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { SidebarMenu } from '../components/ui/sidebar'
import { Switch } from '../components/ui/switch'
import { i18n } from '../i18n'
import { useUiLayoutStore } from '../stores/ui-layout-store'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

const settingsNavigation = [
  { label: 'General', icon: GearSix },
  { label: 'Profile', icon: UserCircle },
  { label: 'Appearance', icon: PaintBrush },
  { label: 'Agents', icon: PaperPlaneTilt },
  { label: 'Models', icon: Cube },
  { label: 'Cloud Agents', icon: Cloud }
] as const

function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const sidebarWidth = useUiLayoutStore((state) => state.leftSidebarWidth)
  const setSidebarWidth = useUiLayoutStore((state) => state.setLeftSidebarWidth)
  const [languageSettings, setLanguageSettings] = useState<LanguageSettings | null>(null)
  const [languageError, setLanguageError] = useState(false)

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

  const resizeSidebar = useCallback((width: number) => {
    setSidebarWidth(clampSidebarWidth(width))
  }, [])

  const startResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()

      const startX = event.clientX
      const startWidth = sidebarWidth

      function handlePointerMove(moveEvent: globalThis.PointerEvent): void {
        resizeSidebar(startWidth + moveEvent.clientX - startX)
      }

      function handlePointerUp(): void {
        window.removeEventListener('pointermove', handlePointerMove)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp, { once: true })
    },
    [resizeSidebar, sidebarWidth]
  )

  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextWidth = sidebarWidth

      if (event.key === 'Home') nextWidth = SIDEBAR_MIN_WIDTH
      if (event.key === 'End') nextWidth = SIDEBAR_MAX_WIDTH
      if (event.key === 'ArrowLeft') nextWidth = sidebarWidth - SIDEBAR_KEYBOARD_RESIZE_STEP
      if (event.key === 'ArrowRight') nextWidth = sidebarWidth + SIDEBAR_KEYBOARD_RESIZE_STEP

      if (nextWidth !== sidebarWidth) {
        event.preventDefault()
        resizeSidebar(nextWidth)
      }
    },
    [resizeSidebar, sidebarWidth]
  )

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
            <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
              <Cube className="h-4 w-4" aria-hidden="true" />
              Upgrade to Pro
            </Button>
            <div className="mt-3">
              <AccountMenu settingsLabel={t('settings.closeSettings')} />
            </div>
          </>
        }
      >
        <Link className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mb-5 w-full justify-start gap-2 text-muted-foreground' })} to="/">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('settings.backToWorkspace')}
        </Link>

        <SidebarSearch
          label="Search Settings"
          className="mb-5"
          inputClassName="h-9 bg-muted pl-9"
          placeholder="Search Settings"
        />

        <SidebarMenu aria-label={t('settings.navigationLabel')}>
          {settingsNavigation.map((item) => (
            <SidebarNavItem
              key={item.label}
              type="link"
              href={`#${item.label.toLowerCase().replaceAll(' ', '-')}`}
              icon={item.icon}
              label={item.label}
              active={item.label === 'General'}
            />
          ))}
        </SidebarMenu>
      </AppSidebar>

      <SidebarResizeHandle
        label={t('workspace.resizeLeftPanel')}
        value={sidebarWidth}
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        className="w-1 bg-background"
        onPointerDown={startResize}
        onKeyDown={resizeWithKeyboard}
      />

      <main aria-label={t('settings.mainLabel')} className="relative min-h-0 flex-1 overflow-auto bg-background">
        <div className="app-titlebar sticky top-0 z-10 h-12" aria-hidden="true" />
        <div className="mx-auto w-full max-w-[810px] px-8 pb-24 pt-12">
          <h1 className="sr-only">{t('settings.title')}</h1>
          <h2 className="mb-6 text-xl font-medium">General</h2>

          <div className="space-y-8">
            <Card className="gap-0 py-0">
              <SettingsRow title="Space Zero Account" description="Manage your account and billing">
                <Button variant="outline" size="sm">Open</Button>
              </SettingsRow>
              <SettingsRow title="Upgrade to Pro" description="Unlock premium models, workspace features, and more.">
                <Button size="sm">Upgrade</Button>
              </SettingsRow>
            </Card>

            <SettingsSection title="Pull Requests">
              <SettingsRow title="Review Provider" description="Choose GitHub for pull request links on web and desktop">
                <Select defaultValue="github">
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>
              <SettingsRow title="PR Link Destination" description="Open pull request links inside Space Zero or in the default browser">
                <Select defaultValue="inside-space-zero">
                  <SelectTrigger size="sm" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inside-space-zero">Inside Space Zero</SelectItem>
                    <SelectItem value="default-browser">Default browser</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Preferences">
              <SettingsRow title={t('settings.language.label')} description={t('settings.language.description')}>
                <Select
                  value={languageSettings?.preference ?? 'system'}
                  onValueChange={(value) => void handleLanguagePreferenceChange(value as LanguagePreference)}
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
              {!languageSettings ? <p className="px-4 pb-3 text-sm text-muted-foreground">{t('settings.language.loading')}</p> : null}
              {languageError ? <p className="px-4 pb-3 text-sm text-destructive">{t('settings.language.saveError')}</p> : null}
            </SettingsSection>

            <SettingsSection title="Notifications">
              <SettingsRow title="System Notifications" description="Show system notifications when an Agent completes or needs attention">
                <Switch checked aria-label="System Notifications" />
              </SettingsRow>
              <SettingsRow title="Warning Notifications" description="Show warning-level in-app toasts">
                <Switch aria-label="Warning Notifications" />
              </SettingsRow>
              <SettingsRow title="Menu Bar Icon" description="Show Space Zero in menu bar">
                <Switch checked aria-label="Menu Bar Icon" />
              </SettingsRow>
              <SettingsRow title="Completion Sound" description="Play a sound when Agent finishes responding">
                <Switch aria-label="Completion Sound" />
              </SettingsRow>
            </SettingsSection>
          </div>
        </div>
      </main>
    </div>
  )
}

