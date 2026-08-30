import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

type LanguagePreference = "system" | "en" | "fr";
type SupportedLanguage = "en" | "fr";

type LanguageSettings = {
  readonly preference: LanguagePreference;
  readonly resolvedLanguage: SupportedLanguage;
  readonly systemLanguage: string;
};

type DesktopSettings = {
  readonly languagePreference: LanguagePreference;
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
      };
    };
  }
}

export {};
