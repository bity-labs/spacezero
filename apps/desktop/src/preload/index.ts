import { contextBridge, ipcRenderer } from "electron";

export interface SpaceZeroPreloadApi {
  readonly getAppVersion: () => Promise<string>;
}

const api: SpaceZeroPreloadApi = Object.freeze({
  getAppVersion: () =>
    ipcRenderer.invoke("spacezero:get-app-version") as Promise<string>,
});

contextBridge.exposeInMainWorld("spacezero", api);
