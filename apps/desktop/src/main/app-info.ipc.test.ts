import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const fromWebContents = vi.fn();
  return {
    handlers,
    app: { getVersion: vi.fn(() => "0.0.0") },
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
  };
});

vi.mock("electron", () => electron);

const { registerAppInfoIpc } = await import("./app-info.ipc.js");

const invoke = (...args: readonly unknown[]) => {
  const handler = electron.handlers.get("spacezero:get-app-version");
  if (!handler) throw new Error("handler missing");
  return handler(...args) as unknown;
};
const event = (overrides: Record<string, unknown> = {}) => {
  const mainFrame = { url: "spacezero://renderer/index.html" };
  const sender = { mainFrame };
  return { sender, senderFrame: mainFrame, ...overrides };
};

describe("App info IPC", () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
  });

  it("returns the app version for trusted main-frame senders", () => {
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
    registerAppInfoIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      getVersion: () => "1.2.3",
    });

    expect(invoke(event())).toBe("1.2.3");
  });

  it("rejects arguments, subframes, detached windows, and untrusted senders", () => {
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
    registerAppInfoIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      getVersion: vi.fn(),
    });

    expect(() => invoke(event(), "unexpected")).toThrow(
      "invalid app version request",
    );
    expect(() =>
      invoke(
        event({ senderFrame: { url: "spacezero://renderer/frame.html" } }),
      ),
    ).toThrow("untrusted app version sender");
    electron.BrowserWindow.fromWebContents.mockReturnValueOnce(null);
    expect(() => invoke(event())).toThrow("untrusted app version sender");
    expect(() =>
      invoke(
        event({
          sender: { mainFrame: { url: "spacezero://renderer/index.html" } },
          senderFrame: { url: "https://evil.invalid/" },
        }),
      ),
    ).toThrow("untrusted app version sender");
  });
});
