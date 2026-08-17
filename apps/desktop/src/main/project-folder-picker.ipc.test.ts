import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const fromWebContents = vi.fn();
  return {
    handlers,
    BrowserWindow: { fromWebContents },
    dialog: { showOpenDialog: vi.fn() },
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

const { registerProjectFolderPickerIpc } =
  await import("./project-folder-picker.ipc.js");

const invoke = (...args: readonly unknown[]) => {
  const handler = electron.handlers.get("spacezero:select-project-folder");
  if (!handler) throw new Error("handler missing");
  return handler(...args) as Promise<unknown>;
};
const event = (overrides: Record<string, unknown> = {}) => {
  const mainFrame = { url: "spacezero://renderer/index.html" };
  const sender = { mainFrame };
  return { sender, senderFrame: mainFrame, ...overrides };
};

describe("Project folder picker IPC", () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
  });

  it("returns cancelled and selected results from trusted main-frame senders", async () => {
    const window = {};
    electron.BrowserWindow.fromWebContents.mockReturnValue(window);
    const showOpenDialog = vi
      .fn()
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })
      .mockResolvedValueOnce({ canceled: false, filePaths: ["/repo"] });
    registerProjectFolderPickerIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      showOpenDialog,
    });

    await expect(invoke(event())).resolves.toEqual({ status: "cancelled" });
    await expect(invoke(event())).resolves.toEqual({
      status: "selected",
      path: "/repo",
    });
    expect(showOpenDialog).toHaveBeenCalledWith(window, {
      properties: ["openDirectory"],
    });
  });

  it("rejects arguments, subframes, detached windows, and untrusted senders", async () => {
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
    registerProjectFolderPickerIpc({
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
      showOpenDialog: vi.fn(),
    });

    await expect(invoke(event(), "unexpected")).rejects.toThrow(
      "invalid project folder picker request",
    );
    await expect(
      invoke(
        event({ senderFrame: { url: "spacezero://renderer/frame.html" } }),
      ),
    ).rejects.toThrow("untrusted project folder picker sender");
    electron.BrowserWindow.fromWebContents.mockReturnValueOnce(null);
    await expect(invoke(event())).rejects.toThrow(
      "untrusted project folder picker sender",
    );
    await expect(
      invoke(
        event({
          sender: { mainFrame: { url: "spacezero://renderer/index.html" } },
          senderFrame: { url: "https://evil.invalid/" },
        }),
      ),
    ).rejects.toThrow("untrusted project folder picker sender");
  });
});
