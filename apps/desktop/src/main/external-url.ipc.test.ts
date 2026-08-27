import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const fromWebContents = vi.fn();
  return {
    handlers,
    BrowserWindow: { fromWebContents },
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
    shell: { openExternal: vi.fn() },
  };
});

vi.mock("electron", () => electron);

const { isSafeExternalUrl, registerExternalUrlIpc } =
  await import("./external-url.ipc.js");

const event = (overrides: Record<string, unknown> = {}) => {
  const mainFrame = { url: "spacezero://renderer/index.html" };
  const sender = { mainFrame };
  return { sender, senderFrame: mainFrame, ...overrides };
};
const invoke = (...args: readonly unknown[]) => {
  const handler = electron.handlers.get("spacezero:open-external-url");
  if (!handler) throw new Error("handler missing");
  return handler(...args) as Promise<unknown>;
};

describe("external URL IPC", () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
  });

  it("opens validated HTTP(S) URLs from trusted main-frame senders", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    registerExternalUrlIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      openExternal,
    });

    await expect(
      invoke(event(), "https://example.com/path?q=1"),
    ).resolves.toEqual({
      status: "opened",
    });
    expect(openExternal).toHaveBeenCalledWith("https://example.com/path?q=1");
  });

  it("rejects unsafe URLs and untrusted senders", async () => {
    const openExternal = vi.fn();
    registerExternalUrlIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      openExternal,
    });

    for (const url of [
      "file:///tmp/secret",
      "javascript:alert(1)",
      "spacezero://callback",
      "https://user:pass@example.com/",
      "https://example.com/\u0000bad",
      "not a url",
    ]) {
      await expect(invoke(event(), url)).rejects.toThrow(
        "invalid external URL request",
      );
    }
    await expect(invoke(event())).rejects.toThrow(
      "invalid external URL request",
    );
    await expect(
      invoke(event(), "https://ok.invalid/", "extra"),
    ).rejects.toThrow("invalid external URL request");
    await expect(
      invoke(
        event({ senderFrame: { url: "spacezero://renderer/frame.html" } }),
        "https://ok.invalid/",
      ),
    ).rejects.toThrow("untrusted external URL sender");
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("exposes the URL validation policy", () => {
    expect(isSafeExternalUrl("https://example.com/")).toBe(true);
    expect(isSafeExternalUrl("http://127.0.0.1:1455/auth/callback")).toBe(true);
    expect(isSafeExternalUrl("ftp://example.com/")).toBe(false);
  });
});
