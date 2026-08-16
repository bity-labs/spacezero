import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const builtMain = join(process.cwd(), "out/main/index.js");

const launchApp = async (): Promise<ElectronApplication> =>
  electron.launch({
    args: [builtMain],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: "http://example.com/attacker-renderer",
    },
  });

const expectSpaceZeroRenderer = async (page: Page): Promise<void> => {
  await expect(page.getByRole("heading", { name: "Space Zero" })).toBeVisible();
};

const closeApp = async (
  app: ElectronApplication | undefined,
): Promise<void> => {
  if (!app) return;
  let forceKill: NodeJS.Timeout | undefined;
  try {
    forceKill = setTimeout(() => {
      if (app.process().exitCode === null) app.process().kill("SIGKILL");
    }, 5000);
    await app.close().catch(() => {
      if (app.process().exitCode === null) app.process().kill("SIGKILL");
    });
  } finally {
    if (forceKill) clearTimeout(forceKill);
  }
};

test("desktop launches with renderer isolation and narrow preload", async () => {
  let app: ElectronApplication | undefined;
  try {
    app = await launchApp();
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expectSpaceZeroRenderer(page);
    const appVersion = await app.evaluate(async ({ app: electronApp }) =>
      electronApp.getVersion(),
    );
    await expect(page.getByText(appVersion)).toBeVisible();
    const isolation = await page.evaluate(() => ({
      hasProcess: "process" in globalThis,
      hasRequire: "require" in globalThis,
      apiKeys: Object.keys(window.spacezero),
    }));
    expect(isolation).toEqual({
      hasProcess: false,
      hasRequire: false,
      apiKeys: ["getAppVersion"],
    });
    const preferences = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const webContents = window?.webContents as
        { getLastWebPreferences: () => unknown } | undefined;
      return webContents?.getLastWebPreferences();
    });
    expect(preferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  } finally {
    await closeApp(app);
  }
});

test("production ignores renderer URL override and blocks renderer-initiated replacement", async () => {
  let app: ElectronApplication | undefined;
  try {
    app = await launchApp();
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expectSpaceZeroRenderer(page);
    const trustedRendererUrl = page.url();
    expect(trustedRendererUrl).not.toBe("http://example.com/attacker-renderer");

    await page.evaluate((url) => {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      document.body.append(iframe);
    }, trustedRendererUrl);
    await expect
      .poll(() =>
        page.frames().some((frame) => frame.url() === trustedRendererUrl),
      )
      .toBe(true);

    await page.evaluate(() => {
      const iframe = document.createElement("iframe");
      iframe.src = "http://127.0.0.1:9/untrusted-frame";
      document.body.append(iframe);
    });
    await expect
      .poll(() =>
        page.frames().some((frame) => frame.url().includes("untrusted-frame")),
      )
      .toBe(false);

    const tempDir = mkdtempSync(join(tmpdir(), "spacezero-navigation-"));
    try {
      const attackerFile = join(tempDir, "attacker.html");
      writeFileSync(attackerFile, "<h1>Attacker</h1>");
      for (const url of [
        "http://127.0.0.1:9/replace-renderer",
        "spacezero-test://replace-renderer",
        `file://${attackerFile}`,
      ]) {
        await page
          .evaluate((nextUrl) => {
            window.location.href = nextUrl;
          }, url)
          .catch(() => undefined);
        await expect
          .poll(async () =>
            app?.evaluate(async ({ BrowserWindow }) =>
              BrowserWindow.getAllWindows()[0]?.webContents.getURL(),
            ),
          )
          .toBe(trustedRendererUrl);
      }
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  } finally {
    await closeApp(app);
  }
});
