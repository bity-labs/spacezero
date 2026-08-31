import { useEffect, useState, type ReactElement } from "react";

import { AppearanceSettingsScreen, type AppearanceSettings } from "./appearance-settings-screen";
import { applyAppearanceSettings, DEFAULT_APPEARANCE_SETTINGS } from "./appearance-preferences";

export function AppearanceSettingsPage(): ReactElement {
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [appearanceError, setAppearanceError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    window.spacezero.settings.getAppearanceSettings().then(
      (settings) => {
        if (cancelled) return;
        setAppearanceSettings(settings);
        applyAppearanceSettings(settings);
      },
      () => {
        if (!cancelled) setAppearanceError(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appearanceSettings.themePreference !== "system") return undefined;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = (): void => applyAppearanceSettings(appearanceSettings);
    media.addEventListener("change", onSystemThemeChange);
    return () => media.removeEventListener("change", onSystemThemeChange);
  }, [appearanceSettings]);

  const updateAppearanceSettings = async (settings: AppearanceSettings): Promise<void> => {
    const previousSettings = appearanceSettings;
    setAppearanceSettings(settings);
    applyAppearanceSettings(settings);
    setAppearanceError(false);

    try {
      const updatedSettings = await window.spacezero.settings.updateAppearanceSettings(settings);
      setAppearanceSettings(updatedSettings);
      applyAppearanceSettings(updatedSettings);
    } catch {
      setAppearanceSettings(previousSettings);
      applyAppearanceSettings(previousSettings);
      setAppearanceError(true);
    }
  };

  return (
    <AppearanceSettingsScreen
      themePreference={appearanceSettings.themePreference}
      fontFamily={appearanceSettings.fontFamily}
      thinFontAntialiasing={appearanceSettings.thinFontAntialiasing}
      appearanceError={appearanceError}
      onThemePreferenceChange={(themePreference) => void updateAppearanceSettings({ ...appearanceSettings, themePreference })}
      onFontFamilyChange={(fontFamily) => void updateAppearanceSettings({ ...appearanceSettings, fontFamily })}
      onThinFontAntialiasingChange={(thinFontAntialiasing) =>
        void updateAppearanceSettings({ ...appearanceSettings, thinFontAntialiasing })
      }
    />
  );
}
