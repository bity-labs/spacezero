import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const builtMain = `${process.cwd()}/out/main/index.js`;
const launchApp = async (): Promise<ElectronApplication> =>
  electron.launch({
    args: [builtMain],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: "http://example.com/attacker-renderer",
      SPACEZERO_DEV_NODE_EXECUTABLE: process.execPath,
    },
  });
const expectSpaceZeroRenderer = async (page: Page): Promise<void> => {
  await expect(page.locator("main.app-root")).toBeVisible();
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

test("desktop launches with renderer isolation, narrow preload, and non-null renderer origin", async () => {
  let app: ElectronApplication | undefined;
  try {
    app = await launchApp();
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expectSpaceZeroRenderer(page);
    expect(await page.evaluate(() => window.location.origin)).toBe(
      "spacezero://renderer",
    );
    const isolation = await page.evaluate(() => ({
      hasProcess: "process" in globalThis,
      hasRequire: "require" in globalThis,
      apiKeys: Object.keys(window.spacezero),
      storage: { local: localStorage.length, session: sessionStorage.length },
    }));
    expect(isolation).toEqual({
      hasProcess: false,
      hasRequire: false,
      apiKeys: [
        "getAppVersion",
        "getLocalHostConnection",
        "selectProjectFolder",
      ],
      storage: { local: 0, session: 0 },
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
    for (const url of [
      "http://127.0.0.1:9/replace-renderer",
      "spacezero-test://replace-renderer",
      "file:///tmp/attacker.html",
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
    await closeApp(app);
  }
});
