import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spacezero/ui/components/select";
import { Switch } from "@spacezero/ui/components/switch";
import type { ReactElement } from "react";

import { SettingsPageHeader } from "./components/settings-page-header";
import { SettingsRow } from "./components/settings-row";
import { SettingsSection } from "./components/settings-section";

export type ThemePreference = "system" | "light" | "dark" | "dark-high-contrast";
export type FontFamilyPreference =
  | "system"
  | "geist"
  | "sf-pro"
  | "inter"
  | "helvetica"
  | "arial"
  | "sf-mono"
  | "menlo"
  | "monaco"
  | "jetbrains-mono"
  | "monospace";

export type AppearanceSettingsScreenProps = {
  themePreference: ThemePreference;
  fontFamily: FontFamilyPreference;
  thinFontAntialiasing: boolean;
  appearanceError: boolean;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  onFontFamilyChange: (fontFamily: FontFamilyPreference) => void;
  onThinFontAntialiasingChange: (thinFontAntialiasing: boolean) => void;
};

export function AppearanceSettingsScreen({
  themePreference,
  fontFamily,
  thinFontAntialiasing,
  appearanceError,
  onThemePreferenceChange,
  onFontFamilyChange,
  onThinFontAntialiasingChange,
}: AppearanceSettingsScreenProps): ReactElement {
  return (
    <>
      <SettingsPageHeader title="Appearance" />
      <div className="flex flex-col gap-8">
        <SettingsSection error={appearanceError ? "Could not update appearance settings." : null}>
          <SettingsRow title="Theme" description="Choose the interface color theme.">
            <Select
              value={themePreference}
              onValueChange={(value) => onThemePreferenceChange(value as ThemePreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label="Theme">
                <SelectValue>{(value: ThemePreference) => getThemePreferenceLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="dark-high-contrast">Dark high contrast</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow title="Font" description="Choose the interface typeface.">
            <Select value={fontFamily} onValueChange={(value) => onFontFamilyChange(value as FontFamilyPreference)}>
              <SelectTrigger size="sm" className="w-48" aria-label="Font">
                <SelectValue>{(value: FontFamilyPreference) => getFontFamilyLabel(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
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
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow title="Use thin font anti-aliasing" description="Use thinner browser-style font rendering.">
            <Switch
              aria-label="Use thin font anti-aliasing"
              checked={thinFontAntialiasing}
              onCheckedChange={(checked) => onThinFontAntialiasingChange(Boolean(checked))}
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  );
}

function getThemePreferenceLabel(preference: ThemePreference): string {
  if (preference === "system") return "System";
  if (preference === "dark") return "Dark";
  if (preference === "dark-high-contrast") return "Dark high contrast";
  return "Light";
}

function getFontFamilyLabel(fontFamily: FontFamilyPreference): string {
  switch (fontFamily) {
    case "system":
      return "System font";
    case "geist":
      return "Geist";
    case "sf-pro":
      return "SF Pro Text";
    case "inter":
      return "Inter";
    case "helvetica":
      return "Helvetica Neue";
    case "arial":
      return "Arial";
    case "sf-mono":
      return "SF Mono";
    case "menlo":
      return "Menlo";
    case "monaco":
      return "Monaco";
    case "jetbrains-mono":
      return "JetBrains Mono";
    case "monospace":
      return "Generic monospace";
  }
}
