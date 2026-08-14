import {
  FONT_FAMILY_PREFERENCES,
  THEME_PREFERENCES,
  resolveTheme,
  type FontFamilyPreference,
  type ThemePreference
} from '../src/shared/appearance-settings'

export const STORYBOOK_THEMES = THEME_PREFERENCES
export const STORYBOOK_FONTS = FONT_FAMILY_PREFERENCES
export const STORYBOOK_FONT_ANTIALIASING = ['thin', 'native'] as const

export type StorybookFontAntialiasing = (typeof STORYBOOK_FONT_ANTIALIASING)[number]

export function applyStorybookAppearance({
  root,
  body,
  themePreference,
  fontFamily,
  fontAntialiasing,
  prefersDark
}: {
  root: HTMLElement
  body: HTMLElement
  themePreference: ThemePreference
  fontFamily: FontFamilyPreference
  fontAntialiasing: StorybookFontAntialiasing
  prefersDark: boolean
}): void {
  const resolvedTheme = resolveTheme(themePreference, prefersDark)
  const useThinFontAntialiasing = fontAntialiasing !== 'native'

  root.classList.toggle('dark', resolvedTheme !== 'light')
  root.classList.toggle('dark-high-contrast', resolvedTheme === 'dark-high-contrast')
  root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'

  body.style.backgroundColor = 'var(--background)'
  body.style.color = 'var(--foreground)'

  for (const availableFontFamily of FONT_FAMILY_PREFERENCES) {
    root.classList.toggle(`font-family-${availableFontFamily}`, fontFamily === availableFontFamily)
  }

  root.classList.toggle('font-smoothing-native', !useThinFontAntialiasing)
  root.classList.toggle('font-smoothing-antialiased', useThinFontAntialiasing)
}
