import { contextBridge, ipcRenderer } from "electron";
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

export interface SpaceZeroPreloadApi {
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
}

const api: SpaceZeroPreloadApi = Object.freeze({
  getAppVersion: () =>
    ipcRenderer.invoke("spacezero:get-app-version") as Promise<string>,
  getLocalHostConnection: () =>
    ipcRenderer.invoke(
      "spacezero:get-local-host-connection",
    ) as Promise<HostConnectionDescriptor>,
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke("spacezero:open-external-url", url) as Promise<{
      readonly status: "opened";
    }>,
  selectProjectFolder: () =>
    ipcRenderer.invoke(
      "spacezero:select-project-folder",
    ) as Promise<ProjectFolderPickerResult>,
  settings: Object.freeze({
    get: () =>
      ipcRenderer.invoke("spacezero:settings:get") as Promise<DesktopSettings>,
    getLanguageSettings: () =>
      ipcRenderer.invoke(
        "spacezero:settings:get-language",
      ) as Promise<LanguageSettings>,
    updateLanguagePreference: (preference: LanguagePreference) =>
      ipcRenderer.invoke(
        "spacezero:settings:update-language",
        preference,
      ) as Promise<LanguageSettings>,
  }),
});

contextBridge.exposeInMainWorld("spacezero", api);
