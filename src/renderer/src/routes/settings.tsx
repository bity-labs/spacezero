import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { LanguagePreference, LanguageSettings } from '@shared/i18n'
import { useCommandPaletteController } from '../../../features/command-palette/renderer/command-palette-controller'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { i18n } from '../i18n'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const commandPalette = useCommandPaletteController()
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
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="app-titlebar grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-3">
        <div className="flex items-center justify-start">
          <div className="mac-traffic-light-space shrink-0" />
        </div>
        <div className="titlebar-control flex items-center justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            aria-label={t('app.openCommandPalette')}
            onClick={() => commandPalette.open()}
          >
            <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
            {t('app.name')}
          </Button>
        </div>
        <nav className="titlebar-control flex items-center justify-end" aria-label={t('settings.navigationLabel')}>
          <Link className="text-sm text-muted-foreground hover:text-foreground" to="/">
            {t('settings.backToWorkspace')}
          </Link>
        </nav>
      </header>

      <main aria-label={t('settings.mainLabel')} className="min-h-0 flex-1 bg-background p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="space-y-3">
            <h1 className="text-xl font-medium">{t('settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.description')}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.language.sectionTitle')}</CardTitle>
              <CardDescription>{t('settings.language.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="text-sm font-medium" htmlFor="language-preference">
                {t('settings.language.label')}
              </label>
              <select
                id="language-preference"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-64"
                disabled={!languageSettings}
                value={languageSettings?.preference ?? 'system'}
                onChange={handleLanguagePreferenceChange}
              >
                <option value="system">{t('settings.language.useSystem')}</option>
                <option value="en">{t('settings.language.english')}</option>
                <option value="fr">{t('settings.language.french')}</option>
              </select>
              {!languageSettings ? <p className="text-sm text-muted-foreground">{t('settings.language.loading')}</p> : null}
              {languageError ? <p className="text-sm text-destructive">{t('settings.language.saveError')}</p> : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
