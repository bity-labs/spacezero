import { contextBridge, ipcRenderer } from "electron";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

export interface SpaceZeroPreloadApi {
  readonly getAppVersion: () => Promise<string>;
  readonly getLocalHostConnection: () => Promise<HostConnectionDescriptor>;
}

const api: SpaceZeroPreloadApi = Object.freeze({
  getAppVersion: () =>
    ipcRenderer.invoke("spacezero:get-app-version") as Promise<string>,
  getLocalHostConnection: () =>
    ipcRenderer.invoke(
      "spacezero:get-local-host-connection",
    ) as Promise<HostConnectionDescriptor>,
});

contextBridge.exposeInMainWorld("spacezero", api);
