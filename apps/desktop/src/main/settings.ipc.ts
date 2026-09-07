import { ipcMain, nativeTheme } from "electron";

import {
  DesktopSettingsStore,
  isFontFamilyPreference,
  isLanguagePreference,
  isLastActiveGlobalChatSessionId,
  isThemePreference,
  type AppearanceSettings,
  type ThemePreference,
} from "./settings-store.js";
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

  ipcMain.handle("spacezero:settings:get-appearance", (event, ...args: readonly unknown[]) => {
    if (args.length !== 0) throw new Error("invalid appearance settings request");
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted appearance settings sender");
    return store.getAppearanceSettings();
  });

  ipcMain.handle("spacezero:settings:update-appearance", async (event, settings: unknown, ...args: readonly unknown[]) => {
    if (args.length !== 0 || !isAppearanceSettings(settings)) {
      throw new Error("invalid appearance settings request");
    }
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted appearance settings sender");
    const updatedSettings = await store.updateAppearanceSettings(settings);
    nativeTheme.themeSource = toNativeThemeSource(updatedSettings.themePreference);
    return updatedSettings;
  });

  ipcMain.handle("spacezero:settings:get-last-active-global-chat-session", (event, ...args: readonly unknown[]) => {
    if (args.length !== 0)
      throw new Error("invalid last active Global Chat Session request");
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted settings sender");
    return store.getLastActiveGlobalChatSessionId();
  });

  ipcMain.handle("spacezero:settings:set-last-active-global-chat-session", (event, sessionId: unknown, ...args: readonly unknown[]) => {
    if (args.length !== 0 || !isLastActiveGlobalChatSessionId(sessionId)) {
      throw new Error("invalid last active Global Chat Session id");
    }
    assertTrustedMainFrame(event, options.isTrustedSender, "untrusted settings sender");
    return store.setLastActiveGlobalChatSessionId(sessionId);
  });

  return () => {
    ipcMain.removeHandler("spacezero:settings:get");
    ipcMain.removeHandler("spacezero:settings:get-language");
    ipcMain.removeHandler("spacezero:settings:update-language");
    ipcMain.removeHandler("spacezero:settings:get-appearance");
    ipcMain.removeHandler("spacezero:settings:update-appearance");
  };
};

function isAppearanceSettings(value: unknown): value is AppearanceSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as { readonly themePreference?: unknown; readonly fontFamily?: unknown; readonly thinFontAntialiasing?: unknown };
  return (
    isThemePreference(settings.themePreference) &&
    isFontFamilyPreference(settings.fontFamily) &&
    typeof settings.thinFontAntialiasing === "boolean"
  );
}

export const toNativeThemeSource = (preference: ThemePreference): "system" | "light" | "dark" => preference;
