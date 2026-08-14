import {
  FONT_FAMILY_PREFERENCES,
  RESOLVED_THEMES,
  type FontFamilyPreference,
  type ResolvedTheme
} from '../src/shared/appearance-settings'

export const STORYBOOK_THEMES = RESOLVED_THEMES
export const STORYBOOK_FONTS = FONT_FAMILY_PREFERENCES

export function applyStorybookAppearance(
  root: HTMLElement,
  theme: ResolvedTheme,
  fontFamily: FontFamilyPreference
): void {
  root.classList.toggle('dark', theme !== 'light')
  root.classList.toggle('dark-high-contrast', theme === 'dark-high-contrast')
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'

  for (const availableFontFamily of FONT_FAMILY_PREFERENCES) {
    root.classList.toggle(`font-family-${availableFontFamily}`, fontFamily === availableFontFamily)
  }

  root.classList.remove('font-smoothing-native')
  root.classList.add('font-smoothing-antialiased')
}
