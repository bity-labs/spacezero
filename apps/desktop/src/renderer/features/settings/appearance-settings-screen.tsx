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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <>
      <SettingsPageHeader title={t("settings.appearance.title")} />
      <div className="flex flex-col gap-8">
        <SettingsSection error={appearanceError ? t("settings.appearance.updateError") : null}>
          <SettingsRow title={t("settings.appearance.theme")} description={t("settings.appearance.themeDescription")}>
            <Select
              value={themePreference}
              onValueChange={(value) => onThemePreferenceChange(value as ThemePreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label={t("settings.appearance.theme")}>
                <SelectValue>{(value: ThemePreference) => getThemePreferenceLabel(value, t)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">{t("settings.appearance.themeOptions.system")}</SelectItem>
                  <SelectItem value="light">{t("settings.appearance.themeOptions.light")}</SelectItem>
                  <SelectItem value="dark">{t("settings.appearance.themeOptions.dark")}</SelectItem>
                  <SelectItem value="dark-high-contrast">{t("settings.appearance.themeOptions.darkHighContrast")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow title={t("settings.appearance.font")} description={t("settings.appearance.fontDescription")}>
            <Select value={fontFamily} onValueChange={(value) => onFontFamilyChange(value as FontFamilyPreference)}>
              <SelectTrigger size="sm" className="w-48" aria-label={t("settings.appearance.font")}>
                <SelectValue>{(value: FontFamilyPreference) => getFontFamilyLabel(value, t)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">{t("settings.appearance.fontOptions.system")}</SelectItem>
                  <SelectItem value="geist">{t("settings.appearance.fontOptions.geist")}</SelectItem>
                  <SelectItem value="sf-pro">{t("settings.appearance.fontOptions.sfPro")}</SelectItem>
                  <SelectItem value="inter">{t("settings.appearance.fontOptions.inter")}</SelectItem>
                  <SelectItem value="helvetica">{t("settings.appearance.fontOptions.helvetica")}</SelectItem>
                  <SelectItem value="arial">{t("settings.appearance.fontOptions.arial")}</SelectItem>
                  <SelectItem value="sf-mono">{t("settings.appearance.fontOptions.sfMono")}</SelectItem>
                  <SelectItem value="menlo">{t("settings.appearance.fontOptions.menlo")}</SelectItem>
                  <SelectItem value="monaco">{t("settings.appearance.fontOptions.monaco")}</SelectItem>
                  <SelectItem value="jetbrains-mono">{t("settings.appearance.fontOptions.jetbrainsMono")}</SelectItem>
                  <SelectItem value="monospace">{t("settings.appearance.fontOptions.monospace")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow title={t("settings.appearance.thinFontAntialiasing")} description={t("settings.appearance.thinFontAntialiasingDescription")}>
            <Switch
              aria-label={t("settings.appearance.thinFontAntialiasing")}
              checked={thinFontAntialiasing}
              onCheckedChange={(checked) => onThinFontAntialiasingChange(Boolean(checked))}
            />
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  );
}

function getThemePreferenceLabel(preference: ThemePreference, t: (key: string) => string): string {
  if (preference === "system") return t("settings.appearance.themeOptions.system");
  if (preference === "dark") return t("settings.appearance.themeOptions.dark");
  if (preference === "dark-high-contrast") return t("settings.appearance.themeOptions.darkHighContrast");
  return t("settings.appearance.themeOptions.light");
}

function getFontFamilyLabel(fontFamily: FontFamilyPreference, t: (key: string) => string): string {
  switch (fontFamily) {
    case "system":
      return t("settings.appearance.fontOptions.system");
    case "geist":
      return t("settings.appearance.fontOptions.geist");
    case "sf-pro":
      return t("settings.appearance.fontOptions.sfPro");
    case "inter":
      return t("settings.appearance.fontOptions.inter");
    case "helvetica":
      return t("settings.appearance.fontOptions.helvetica");
    case "arial":
      return t("settings.appearance.fontOptions.arial");
    case "sf-mono":
      return t("settings.appearance.fontOptions.sfMono");
    case "menlo":
      return t("settings.appearance.fontOptions.menlo");
    case "monaco":
      return t("settings.appearance.fontOptions.monaco");
    case "jetbrains-mono":
      return t("settings.appearance.fontOptions.jetbrainsMono");
    case "monospace":
      return t("settings.appearance.fontOptions.monospace");
  }
}
