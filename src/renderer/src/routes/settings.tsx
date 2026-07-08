import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  Cloud,
  Cube,
  GearSix,
  MagnifyingGlass,
  PaintBrush,
  PaperPlaneTilt,
  UserCircle
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import { AccountMenu } from '../components/app-shell/account-menu'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { i18n } from '../i18n'
import { cn } from '../lib/utils'

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

  async function handleLanguagePreferenceChange(event: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const preference = event.target.value as LanguagePreference
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
      <aside className="app-titlebar flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-12 items-center px-3">
          <div className="mac-traffic-light-space shrink-0" />
        </div>

        <div className="titlebar-control flex min-h-0 flex-1 flex-col px-2 pb-3">
          <Link className="mb-5 flex w-fit items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground" to="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('settings.backToWorkspace')}
          </Link>

          <label className="relative mb-5 block">
            <span className="sr-only">Search Settings</span>
            <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              className="h-9 w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              placeholder="Search Settings"
              type="search"
            />
          </label>

          <nav className="space-y-1" aria-label={t('settings.navigationLabel')}>
            {settingsNavigation.map((item) => {
              const Icon = item.icon

              return (
                <a
                  key={item.label}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                    item.label === 'General' ? 'bg-muted text-foreground' : null
                  )}
                  href={`#${item.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </a>
              )
            })}
          </nav>

          <Button variant="outline" size="sm" className="mt-auto justify-start gap-2 text-muted-foreground">
            <Cube className="h-4 w-4" aria-hidden="true" />
            Upgrade to Pro
          </Button>
          <div className="mt-3">
            <AccountMenu settingsLabel={t('settings.closeSettings')} settingsTo="/" />
          </div>
        </div>
      </aside>

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
                <select className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <option>GitHub</option>
                </select>
              </SettingsRow>
              <SettingsRow title="PR Link Destination" description="Open pull request links inside Space Zero or in the default browser">
                <select className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                  <option>Inside Space Zero</option>
                  <option>Default browser</option>
                </select>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Preferences">
              <SettingsRow title={t('settings.language.label')} description={t('settings.language.description')}>
                <select
                  id="language-preference"
                  className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!languageSettings}
                  value={languageSettings?.preference ?? 'system'}
                  aria-label={t('settings.language.label')}
                  onChange={handleLanguagePreferenceChange}
                >
                  <option value="system">{t('settings.language.useSystem')}</option>
                  <option value="en">{t('settings.language.english')}</option>
                  <option value="fr">{t('settings.language.french')}</option>
                </select>
              </SettingsRow>
              {!languageSettings ? <p className="px-4 pb-3 text-sm text-muted-foreground">{t('settings.language.loading')}</p> : null}
              {languageError ? <p className="px-4 pb-3 text-sm text-destructive">{t('settings.language.saveError')}</p> : null}
            </SettingsSection>

            <SettingsSection title="Notifications">
              <SettingsRow title="System Notifications" description="Show system notifications when an Agent completes or needs attention">
                <Toggle checked label="System Notifications" />
              </SettingsRow>
              <SettingsRow title="Warning Notifications" description="Show warning-level in-app toasts">
                <Toggle label="Warning Notifications" />
              </SettingsRow>
              <SettingsRow title="Menu Bar Icon" description="Show Space Zero in menu bar">
                <Toggle checked label="Menu Bar Icon" />
              </SettingsRow>
              <SettingsRow title="Completion Sound" description="Play a sound when Agent finishes responding">
                <Toggle label="Completion Sound" />
              </SettingsRow>
            </SettingsSection>
          </div>
        </div>
      </main>
    </div>
  )
}

type SettingsSectionProps = {
  title: string
  children: React.ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps): React.JSX.Element {
  return (
    <section className="space-y-3">
      <h3 className="px-2 text-sm text-muted-foreground">{title}</h3>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  )
}

type SettingsRowProps = {
  title: string
  description: string
  children: React.ReactNode
}

function SettingsRow({ title, description, children }: SettingsRowProps): React.JSX.Element {
  return (
    <div className="flex min-h-18 items-center gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

type ToggleProps = {
  checked?: boolean
  label: string
}

function Toggle({ checked = false, label }: ToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative h-5 w-9 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        checked ? 'bg-emerald-600' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
