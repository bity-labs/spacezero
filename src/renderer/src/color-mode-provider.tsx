import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { ResolvedTheme, ThemePreference } from '@shared/theme'
import { resolveTheme } from '@shared/theme'

type ColorModeContextValue = {
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  updateThemePreference: (preference: ThemePreference) => Promise<void>
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

  useEffect(() => {
    let isCurrent = true

    window.spacezero.settings
      .getThemeSettings()
      .then((settings) => {
        if (!isCurrent) return
        setThemePreference(settings.preference)
        setResolvedTheme(resolveTheme(settings.preference, getSystemPrefersDark()))
      })
      .catch(() => {
        if (!isCurrent) return
        setThemePreference('system')
        setResolvedTheme(resolveTheme('system', getSystemPrefersDark()))
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

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

  const value = useMemo(
    () => ({ themePreference, resolvedTheme, updateThemePreference }),
    [themePreference, resolvedTheme, updateThemePreference]
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

function getSystemPrefersDark(): boolean {
  return window.matchMedia(DARK_SCHEME_QUERY).matches
}
