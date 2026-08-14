import type { AppearanceSettingsScreenProps } from './appearance-settings-screen'

const noOp = (): void => undefined

export const appearanceSettingsScreenDefaultArgs = {
  themePreference: 'system',
  fontFamily: 'system',
  thinFontAntialiasing: true,
  appearanceError: false,
  onThemePreferenceChange: noOp,
  onFontFamilyChange: noOp,
  onThinFontAntialiasingChange: noOp
} satisfies AppearanceSettingsScreenProps

export const appearanceSettingsScreenErrorArgs = {
  ...appearanceSettingsScreenDefaultArgs,
  appearanceError: true
} satisfies AppearanceSettingsScreenProps
