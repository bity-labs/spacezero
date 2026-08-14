import { useState } from 'react'

import type { FontFamilyPreference, ThemePreference } from '@shared/appearance-settings'

import { useAppearance } from '@renderer/appearance-provider'
import { AppearanceSettingsScreen } from '../screens/appearance-settings-screen'

export function AppearanceSettingsPage(): React.JSX.Element {
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
    <AppearanceSettingsScreen
      themePreference={themePreference}
      fontFamily={fontFamily}
      thinFontAntialiasing={thinFontAntialiasing}
      appearanceError={appearanceError}
      onThemePreferenceChange={(preference) => void handleThemePreferenceChange(preference)}
      onFontFamilyChange={(nextFontFamily) => void handleFontFamilyChange(nextFontFamily)}
      onThinFontAntialiasingChange={(enabled) => void handleThinFontAntialiasingChange(enabled)}
    />
  )
}
