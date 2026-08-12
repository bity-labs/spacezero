import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FontFamilyPreference } from '@shared/appearance-settings'
import type { ThemePreference } from '@shared/theme'

import { useColorMode } from '@renderer/color-mode-provider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { Text } from '@renderer/components/ui/typography'
import { SettingsPageHeader } from '../components/settings-page-header'
import { SettingsRow } from '../components/settings-row'
import { SettingsSection } from '../components/settings-section'

export function AppearanceSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const { themePreference, appearanceSettings, updateThemePreference, updateAppearanceSettings } =
    useColorMode()
  const [appearanceError, setAppearanceError] = useState(false)

  async function handleThemePreferenceChange(preference: ThemePreference): Promise<void> {
    setAppearanceError(false)

    try {
      await updateThemePreference(preference)
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
          <SettingsRow
            title={t('settings.theme.label')}
            description={t('settings.theme.description')}
          >
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
              value={appearanceSettings.fontFamily}
              onValueChange={(value) => void handleFontFamilyChange(value as FontFamilyPreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label="Font">
                <SelectValue>
                  {(value: FontFamilyPreference) => getFontFamilyLabel(value)}
                </SelectValue>
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
              checked={appearanceSettings.thinFontAntialiasing}
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
