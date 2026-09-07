import { beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    BrowserWindow: { fromWebContents: vi.fn(() => ({})) },
    ipcMain: {
      handle: vi.fn(
        (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        },
      ),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    },
    nativeTheme: { themeSource: "system", on: vi.fn() },
  };
});

vi.mock("electron", () => electron);

const { registerSettingsIpc } = await import("./settings.ipc.js");
const { DesktopSettingsStore } = await import("./settings-store.js");

const frame = { url: "spacezero://renderer/index.html" };
const event = { sender: { mainFrame: frame }, senderFrame: frame };
const invokeAsync = async (
  channel: string,
  ...args: readonly unknown[]
): Promise<unknown> => invoke(channel, ...args);
const invoke = (channel: string, ...args: readonly unknown[]): unknown => {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error(`handler missing for ${channel}`);
  return handler(event, ...args);
};

describe("settings IPC last active Global Chat Session routes", () => {
  beforeEach(async () => {
    electron.handlers.clear();
    vi.clearAllMocks();
    await rm("/tmp/spacezero-settings-ipc-test", { recursive: true, force: true });
  });

  it("gets and sets the last active Global Chat Session id", async () => {
    registerSettingsIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      store: new DesktopSettingsStore(
        "/tmp/spacezero-settings-ipc-test/settings.json",
      ),
    });

    expect(await (invoke(
      "spacezero:settings:get-last-active-global-chat-session",
    ) as Promise<string | null>)).toBeNull();

    await (invoke(
      "spacezero:settings:set-last-active-global-chat-session",
      "abc-123",
    ) as Promise<void>);

    expect(await (invoke(
      "spacezero:settings:get-last-active-global-chat-session",
    ) as Promise<string | null>)).toBe("abc-123");
  });

  it("rejects invalid marker values and argument shapes", async () => {
    registerSettingsIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      store: new DesktopSettingsStore(
        "/tmp/spacezero-settings-ipc-test/settings.json",
      ),
    });

    await expect(
      invokeAsync(
        "spacezero:settings:set-last-active-global-chat-session",
        { credential: "boom" },
      ),
    ).rejects.toThrow();
    await expect(
      invokeAsync("spacezero:settings:set-last-active-global-chat-session"),
    ).rejects.toThrow();
    await expect(
      invokeAsync(
        "spacezero:settings:set-last-active-global-chat-session",
        "abc",
        "extra",
      ),
    ).rejects.toThrow();
    await expect(
      invokeAsync("spacezero:settings:get-last-active-global-chat-session", "extra"),
    ).rejects.toThrow();
  });
});
