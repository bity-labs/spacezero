import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

type LanguagePreference = "system" | "en" | "fr";
type SupportedLanguage = "en" | "fr";
type ThemePreference = "system" | "light" | "dark";
type FontFamilyPreference =
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

type LanguageSettings = {
  readonly preference: LanguagePreference;
  readonly resolvedLanguage: SupportedLanguage;
  readonly systemLanguage: string;
};

type AppearanceSettings = {
  readonly themePreference: ThemePreference;
  readonly fontFamily: FontFamilyPreference;
  readonly thinFontAntialiasing: boolean;
};

type DesktopSettings = {
  readonly languagePreference: LanguagePreference;
  readonly themePreference: ThemePreference;
  readonly fontFamily: FontFamilyPreference;
  readonly thinFontAntialiasing: boolean;
};

declare global {
  interface Window {
    readonly spacezero: {
      readonly getAppVersion: () => Promise<string>;
      readonly getLocalHostConnection: () => Promise<HostConnectionDescriptor>;
      readonly openExternalUrl: (
        url: string,
      ) => Promise<{ readonly status: "opened" }>;
      readonly selectProjectFolder: () => Promise<ProjectFolderPickerResult>;
      readonly settings: {
        readonly get: () => Promise<DesktopSettings>;
        readonly getLanguageSettings: () => Promise<LanguageSettings>;
        readonly updateLanguagePreference: (
          preference: LanguagePreference,
        ) => Promise<LanguageSettings>;
        readonly getAppearanceSettings: () => Promise<AppearanceSettings>;
        readonly updateAppearanceSettings: (
          settings: AppearanceSettings,
        ) => Promise<AppearanceSettings>;
      };
    };
  }
}

export {};
