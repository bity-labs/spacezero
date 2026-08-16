import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrustedRendererPolicy } from "./navigation-policy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererIndexPath = join(__dirname, "../renderer/index.html");

const createWindow = (): BrowserWindow => {
  const rendererPolicy = createTrustedRendererPolicy({
    isDevelopment: import.meta.env.DEV,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    packagedRendererPath: rendererIndexPath,
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

  if (rendererPolicy.source === "dev-url") {
    void window.loadURL(rendererPolicy.initialUrl);
  } else {
    void window.loadFile(rendererIndexPath);
  }
  return window;
};

ipcMain.handle("spacezero:get-app-version", () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
