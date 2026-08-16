import { BrowserWindow, type App } from "electron";
import type { LocalHostSupervisor } from "./local-host/local-host-supervisor.js";

export const installAppLifecycle = (
  app: App,
  createWindow: () => BrowserWindow,
  supervisor: LocalHostSupervisor,
): void => {
  let quitting = false;
  let stopComplete = false;
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on("window-all-closed", () => undefined);
  app.on("before-quit", (event) => {
    if (stopComplete) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    supervisor.stop().finally(() => {
      stopComplete = true;
      app.quit();
    });
  });
};
