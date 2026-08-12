import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

import {
  FONT_FAMILY_PREFERENCES,
  createDefaultAppearanceSettings,
  resolveTheme,
  type AppearanceSettings,
  type UpdateAppearanceSettingsRequest
} from '@shared/appearance-settings'

type AppearanceContextValue = AppearanceSettings & {
  updateAppearanceSettings: (settings: UpdateAppearanceSettingsRequest) => Promise<void>
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null)

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

type AppearanceProviderProps = {
  children: ReactNode
}

export function AppearanceProvider({ children }: AppearanceProviderProps): React.JSX.Element {
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(() =>
    createDefaultAppearanceSettings(getSystemPrefersDark())
  )

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getAppearanceSettings()
      .then((settings) => {
        if (!isCurrent) return
        setAppearanceSettings(resolveForRenderer(settings))
      })
      .catch(() => {
        if (!isCurrent) return
        setAppearanceSettings(createDefaultAppearanceSettings(getSystemPrefersDark()))
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    const { resolvedTheme } = appearanceSettings
    document.documentElement.classList.toggle('dark', resolvedTheme !== 'light')
    document.documentElement.classList.toggle(
      'dark-high-contrast',
      resolvedTheme === 'dark-high-contrast'
    )
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'
  }, [appearanceSettings.resolvedTheme])

  useEffect(() => {
    const root = document.documentElement

    for (const fontFamily of FONT_FAMILY_PREFERENCES) {
      root.classList.toggle(
        `font-family-${fontFamily}`,
        appearanceSettings.fontFamily === fontFamily
      )
    }

    root.classList.toggle('font-smoothing-native', !appearanceSettings.thinFontAntialiasing)
    root.classList.toggle('font-smoothing-antialiased', appearanceSettings.thinFontAntialiasing)
  }, [appearanceSettings.fontFamily, appearanceSettings.thinFontAntialiasing])

  useEffect(() => {
    if (appearanceSettings.themePreference !== 'system') return

    const media = window.matchMedia(DARK_SCHEME_QUERY)
    const syncSystemTheme = (): void => {
      setAppearanceSettings((settings) => ({
        ...settings,
        resolvedTheme: resolveTheme('system', media.matches)
      }))
    }

    syncSystemTheme()
    media.addEventListener('change', syncSystemTheme)

    return () => media.removeEventListener('change', syncSystemTheme)
  }, [appearanceSettings.themePreference])

  const updateAppearanceSettings = useCallback(
    async (settings: UpdateAppearanceSettingsRequest): Promise<void> => {
      const nextSettings = await window.spacezero.settings.updateAppearanceSettings(settings)
      setAppearanceSettings(resolveForRenderer(nextSettings))
    },
    []
  )

  const value = useMemo(
    () => ({ ...appearanceSettings, updateAppearanceSettings }),
    [appearanceSettings, updateAppearanceSettings]
  )

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext)

  if (!context) {
    throw new Error('useAppearance must be used within AppearanceProvider')
  }

  return context
}

export function useOptionalAppearance(): AppearanceContextValue | null {
  return useContext(AppearanceContext)
}

function resolveForRenderer(settings: AppearanceSettings): AppearanceSettings {
  return {
    ...settings,
    resolvedTheme: resolveTheme(settings.themePreference, getSystemPrefersDark())
  }
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches
}
