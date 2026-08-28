import type { ReactElement } from "react";

import { AppearanceSettingsScreen } from "./appearance-settings-screen";

export function AppearanceSettingsPage(): ReactElement {
  return (
    <AppearanceSettingsScreen
      themePreference="system"
      fontFamily="system"
      thinFontAntialiasing
      appearanceError={false}
      onThemePreferenceChange={() => undefined}
      onFontFamilyChange={() => undefined}
      onThinFontAntialiasingChange={() => undefined}
    />
  );
}
