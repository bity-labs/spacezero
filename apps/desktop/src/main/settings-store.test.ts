import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => "/tmp/spacezero-test-user-data"),
    getPreferredSystemLanguages: vi.fn(() => ["en-US"]),
    getLocale: vi.fn(() => "en-US"),
  },
}));

vi.mock("electron", () => electron);

const { DesktopSettingsStore } = await import("./settings-store.js");
const { readFile, rm, writeFile, mkdir } = await import("node:fs/promises");

const settingsPath = "/tmp/spacezero-settings-test/settings.json";

describe("DesktopSettingsStore last active Global Chat route marker", () => {
  beforeEach(async () => {
    await rm("/tmp/spacezero-settings-test", { recursive: true, force: true });
    electron.app.getPath.mockReturnValue("/tmp/spacezero-settings-test");
  });

  it("defaults the marker to null when no settings file exists", async () => {
    const store = new DesktopSettingsStore(settingsPath);

    expect(await store.getLastActiveGlobalChatSessionId()).toBeNull();
  });

  it("persists the last active Global Chat Session id and round-trips it", async () => {
    const store = new DesktopSettingsStore(settingsPath);

    await store.setLastActiveGlobalChatSessionId("abc-123");

    expect(await store.getLastActiveGlobalChatSessionId()).toBe("abc-123");
    const raw = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw.lastActiveGlobalChatSessionId).toBe("abc-123");
    // Only the known settings fields are persisted: no secrets or opaque blobs.
    expect(Object.keys(raw).sort()).toEqual(
      [
        "fontFamily",
        "languagePreference",
        "lastActiveGlobalChatSessionId",
        "themePreference",
        "thinFontAntialiasing",
      ].sort(),
    );
  });

  it("clears the marker with null", async () => {
    const store = new DesktopSettingsStore(settingsPath);
    await store.setLastActiveGlobalChatSessionId("abc-123");

    await store.setLastActiveGlobalChatSessionId(null);

    expect(await store.getLastActiveGlobalChatSessionId()).toBeNull();
    const raw = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(raw.lastActiveGlobalChatSessionId).toBeNull();
  });

  it("keeps the marker when user preferences are updated", async () => {
    const store = new DesktopSettingsStore(settingsPath);
    await store.setLastActiveGlobalChatSessionId("abc-123");

    await store.updateLanguagePreference("fr");

    expect(await store.getLastActiveGlobalChatSessionId()).toBe("abc-123");
    expect((await store.getSettings()).languagePreference).toBe("fr");
  });

  it("ignores corrupt marker values instead of trusting them", async () => {
    await mkdir("/tmp/spacezero-settings-test", { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        languagePreference: "en",
        themePreference: "system",
        fontFamily: "system",
        thinFontAntialiasing: true,
        lastActiveGlobalChatSessionId: { secret: "boom" },
      }),
      "utf8",
    );
    const store = new DesktopSettingsStore(settingsPath);

    expect(await store.getLastActiveGlobalChatSessionId()).toBeNull();
  });
});
