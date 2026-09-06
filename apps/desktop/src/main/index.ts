import { app, BrowserWindow, nativeTheme } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppInfoIpc } from "./app-info.ipc.js";
import { installAppLifecycle } from "./app-lifecycle.js";
import { registerExternalUrlIpc } from "./external-url.ipc.js";
import { registerLocalHostIpc } from "./local-host/local-host.ipc.js";
import { registerProjectFolderPickerIpc } from "./project-folder-picker.ipc.js";
import { registerSettingsIpc, toNativeThemeSource } from "./settings.ipc.js";
import { DesktopSettingsStore } from "./settings-store.js";
import { createLocalHostSupervisor } from "./local-host/local-host-supervisor.js";
import { createTrustedRendererPolicy } from "./navigation-policy.js";
import {
  builtRendererRoot,
  registerRendererProtocol,
  registerRendererSchemePrivilege,
} from "./renderer-protocol.js";

registerRendererSchemePrivilege();

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererRoot = builtRendererRoot(__dirname);
const supervisor = createLocalHostSupervisor();
const settingsStore = new DesktopSettingsStore();
const rendererPolicy = createTrustedRendererPolicy({
  isDevelopment: import.meta.env.DEV,
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
});
const isTrustedSender = (url: string): boolean =>
  rendererPolicy.canNavigateInWindow(url);
let initialStartupComplete = false;

/**
 * Native window background kept in sync with the shared UI theme tokens
 * (packages/ui globals.css: light `oklch(1 0 0)`, dark `oklch(0.148 0.004 228.8)`).
 * It only covers the pre-render flash; the renderer theme is CSS-driven.
 */
const windowBackgroundColor = (): string =>
  nativeTheme.shouldUseDarkColors ? "#090b0c" : "#ffffff";

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    show: false,
    title: "Space Zero",
    backgroundColor: windowBackgroundColor(),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 12 },
        }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "../preload/index.js"),
    },
  });
  window.once("ready-to-show", () => window.show());
  nativeTheme.on("updated", () => {
    window.setBackgroundColor(windowBackgroundColor());
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (details) => {
    if (!rendererPolicy.canNavigateInWindow(details.url))
      details.preventDefault();
  });
  window.webContents.on("will-frame-navigate", (details) => {
    if (!rendererPolicy.canNavigateInWindow(details.url))
      details.preventDefault();
  });
  void window.loadURL(rendererPolicy.initialUrl);
  return window;
};

registerAppInfoIpc({ isTrustedSender });
registerExternalUrlIpc({ isTrustedSender });
registerLocalHostIpc({ supervisor, isTrustedSender });
registerSettingsIpc({ isTrustedSender, store: settingsStore });

app.whenReady().then(async () => {
  await supervisor
    .start(
      rendererPolicy.allowedRendererOrigin,
      join(app.getPath("home"), "SpaceZero"),
    )
    .catch(() => undefined);
  const settings = await settingsStore.getSettings().catch(() => null);
  nativeTheme.themeSource = toNativeThemeSource(
    settings?.themePreference ?? "system",
  );
  registerRendererProtocol(rendererRoot, supervisor.endpoint());
  registerProjectFolderPickerIpc({ isTrustedSender });
  initialStartupComplete = true;
  createWindow();
});
installAppLifecycle(app, createWindow, supervisor, {
  canCreateWindow: () => initialStartupComplete,
});
