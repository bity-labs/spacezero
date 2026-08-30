import { ipcMain } from "electron";

import { DesktopSettingsStore, isLanguagePreference } from "./settings-store.js";
import {
  assertTrustedMainFrame,
  type TrustedSenderPredicate,
} from "./trusted-ipc.js";

export type SettingsIpcOptions = {
  readonly isTrustedSender: TrustedSenderPredicate;
  readonly store?: DesktopSettingsStore;
};

export const registerSettingsIpc = (options: SettingsIpcOptions): (() => void) => {
  const store = options.store ?? new DesktopSettingsStore();

  ipcMain.handle("spacezero:settings:get", (event, ...args: readonly unknown[]) => {
    if (args.length !== 0) throw new Error("invalid settings request");
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted settings sender");
    return store.getSettings();
  });

  ipcMain.handle("spacezero:settings:get-language", (event, ...args: readonly unknown[]) => {
    if (args.length !== 0) throw new Error("invalid language settings request");
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted language settings sender");
    return store.getLanguageSettings();
  });

  ipcMain.handle("spacezero:settings:update-language", (event, preference: unknown, ...args: readonly unknown[]) => {
    if (args.length !== 0 || !isLanguagePreference(preference)) {
      throw new Error("invalid language preference request");
    }
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted language settings sender");
    return store.updateLanguagePreference(preference);
  });

  return () => {
    ipcMain.removeHandler("spacezero:settings:get");
    ipcMain.removeHandler("spacezero:settings:get-language");
    ipcMain.removeHandler("spacezero:settings:update-language");
  };
};
