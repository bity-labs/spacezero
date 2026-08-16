import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from "@playwright/test";

const builtMain = `${process.cwd()}/out/main/index.js`;
const launchApp = async (): Promise<ElectronApplication> =>
  electron.launch({
    args: [builtMain],
    env: { ...process.env, SPACEZERO_DEV_NODE_EXECUTABLE: process.execPath },
  });
const closeApp = async (
  app: ElectronApplication | undefined,
): Promise<void> => {
  if (!app) return;
  const timer = setTimeout(() => {
    if (app.process().exitCode === null) app.process().kill("SIGKILL");
  }, 7000);
  try {
    await app.close();
  } finally {
    clearTimeout(timer);
  }
};

test("real Desktop reaches real Local Host query and SSE, then reconnects after reload", async () => {
  let app: ElectronApplication | undefined;
  try {
    app = await launchApp();
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("connected")).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => window.location.origin)).toBe(
      "spacezero://renderer",
    );
    await page.reload();
    await expect(page.getByText("connected")).toBeVisible({ timeout: 10000 });
    const keys = await page.evaluate(() => Object.keys(window.spacezero));
    expect(keys).toEqual(["getAppVersion", "getLocalHostConnection"]);
  } finally {
    await closeApp(app);
  }
});
