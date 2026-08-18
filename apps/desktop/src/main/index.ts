import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installAppLifecycle } from "./app-lifecycle.js";
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

const createWindow = (): BrowserWindow => {
  const rendererPolicy = createTrustedRendererPolicy({
    isDevelopment: import.meta.env.DEV,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
  });
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

ipcMain.handle("spacezero:get-app-version", () => app.getVersion());
registerLocalHostIpc(supervisor);

app.whenReady().then(async () => {
  const rendererPolicy = createTrustedRendererPolicy({
    isDevelopment: import.meta.env.DEV,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
  });
  await supervisor
    .start(
      rendererPolicy.allowedRendererOrigin,
      join(app.getPath("home"), "SpaceZero"),
    )
    .catch(() => undefined);
  registerRendererProtocol(rendererRoot, supervisor.endpoint());
  registerProjectFolderPickerIpc({
    isTrustedSender: (url) => rendererPolicy.canNavigateInWindow(url),
  });
  createWindow();
});
installAppLifecycle(app, createWindow, supervisor);
