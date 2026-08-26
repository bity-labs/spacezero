import { contextBridge, ipcRenderer } from "electron";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

export interface SpaceZeroPreloadApi {
  readonly getAppVersion: () => Promise<string>;
  readonly getLocalHostConnection: () => Promise<HostConnectionDescriptor>;
  readonly openExternalUrl: (
    url: string,
  ) => Promise<{ readonly status: "opened" }>;
  readonly selectProjectFolder: () => Promise<ProjectFolderPickerResult>;
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
});

contextBridge.exposeInMainWorld("spacezero", api);
