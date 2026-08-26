import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppInfoIpc } from "./app-info.ipc.js";
import { installAppLifecycle } from "./app-lifecycle.js";
import { registerExternalUrlIpc } from "./external-url.ipc.js";
import { registerLocalHostIpc } from "./local-host/local-host.ipc.js";
import { registerProjectFolderPickerIpc } from "./project-folder-picker.ipc.js";
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
const rendererPolicy = createTrustedRendererPolicy({
  isDevelopment: import.meta.env.DEV,
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
});
const isTrustedSender = (url: string): boolean =>
  rendererPolicy.canNavigateInWindow(url);

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    title: "Space Zero",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "../preload/index.js"),
    },
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

app.whenReady().then(async () => {
  await supervisor
    .start(
      rendererPolicy.allowedRendererOrigin,
      join(app.getPath("home"), "SpaceZero"),
    )
    .catch(() => undefined);
  registerRendererProtocol(rendererRoot, supervisor.endpoint());
  registerProjectFolderPickerIpc({ isTrustedSender });
  createWindow();
});
installAppLifecycle(app, createWindow, supervisor);
