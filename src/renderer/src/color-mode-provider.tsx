import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { AppearanceSettings, FontFamilyPreference } from '@shared/appearance-settings'
import type { ResolvedTheme, ThemePreference } from '@shared/theme'
import { resolveTheme } from '@shared/theme'

type ColorModeContextValue = {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  appearanceSettings: AppearanceSettings
  updateThemePreference: (preference: ThemePreference) => Promise<void>
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => Promise<void>
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null)

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

type ColorModeProviderProps = {
  children: ReactNode
}

export function ColorModeProvider({ children }: ColorModeProviderProps): React.JSX.Element {
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme('system', getSystemPrefersDark())
  )
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>({
    fontFamily: 'system',
    thinFontAntialiasing: true
  })

  useEffect(() => {
    let isCurrent = true

    Promise.all([
      window.spacezero.settings.getThemeSettings(),
      window.spacezero.settings.getAppearanceSettings()
    ])
      .then(([themeSettings, nextAppearanceSettings]) => {
        if (!isCurrent) return
        setThemePreference(themeSettings.preference)
        setResolvedTheme(resolveTheme(themeSettings.preference, getSystemPrefersDark()))
        setAppearanceSettings(nextAppearanceSettings)
      })
      .catch(() => {
        if (!isCurrent) return
        setThemePreference('system')
        setResolvedTheme(resolveTheme('system', getSystemPrefersDark()))
        setAppearanceSettings({ fontFamily: 'system', thinFontAntialiasing: true })
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme !== 'light')
    document.documentElement.classList.toggle('dark-high-contrast', resolvedTheme === 'dark-high-contrast')
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'
  }, [resolvedTheme])

  useEffect(() => {
    const root = document.documentElement
    const fontFamilies: FontFamilyPreference[] = [
      'system',
      'geist',
      'sf-pro',
      'inter',
      'helvetica',
      'arial',
      'sf-mono',
      'menlo',
      'monaco',
      'jetbrains-mono',
      'monospace'
    ]

    for (const fontFamily of fontFamilies) {
      root.classList.toggle(`font-family-${fontFamily}`, appearanceSettings.fontFamily === fontFamily)
    }

    root.classList.toggle('font-smoothing-native', !appearanceSettings.thinFontAntialiasing)
    root.classList.toggle('font-smoothing-antialiased', appearanceSettings.thinFontAntialiasing)
  }, [appearanceSettings])

  useEffect(() => {
    if (themePreference !== 'system') return

    const media = window.matchMedia(DARK_SCHEME_QUERY)
    const syncSystemTheme = (): void => setResolvedTheme(resolveTheme('system', media.matches))

    syncSystemTheme()
    media.addEventListener('change', syncSystemTheme)

    return () => media.removeEventListener('change', syncSystemTheme)
  }, [themePreference])

  const updateThemePreference = useCallback(async (preference: ThemePreference): Promise<void> => {
    const settings = await window.spacezero.settings.updateThemePreference(preference)
    setThemePreference(settings.preference)
    setResolvedTheme(resolveTheme(settings.preference, getSystemPrefersDark()))
  }, [])

  const updateAppearanceSettings = useCallback(
    async (settings: Partial<AppearanceSettings>): Promise<void> => {
      const nextSettings = await window.spacezero.settings.updateAppearanceSettings(settings)
      setAppearanceSettings(nextSettings)
    },
    []
  )

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      appearanceSettings,
      updateThemePreference,
      updateAppearanceSettings
    }),
    [
      themePreference,
      resolvedTheme,
      appearanceSettings,
      updateThemePreference,
      updateAppearanceSettings
    ]
  )

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext)

  if (!context) {
    throw new Error('useColorMode must be used within ColorModeProvider')
  }

  return context
}

export function useOptionalColorMode(): ColorModeContextValue | null {
  return useContext(ColorModeContext)
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches
}
