import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
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
  };
});

vi.mock("electron", () => electron);

const { registerLocalHostIpc } = await import("./local-host.ipc.js");
const localHostSupervisor = (
  getClientConnection: () => Promise<HostConnectionDescriptor>,
) => ({
  start: vi.fn(),
  getClientConnection,
  stop: vi.fn(),
  endpoint: vi.fn(),
});

const invoke = (...args: readonly unknown[]) => {
  const handler = electron.handlers.get("spacezero:get-local-host-connection");
  if (!handler) throw new Error("handler missing");
  return handler(...args) as Promise<unknown>;
};
const event = (overrides: Record<string, unknown> = {}) => {
  const mainFrame = { url: "spacezero://renderer/index.html" };
  const sender = { mainFrame };
  return { sender, senderFrame: mainFrame, ...overrides };
};

describe("Local Host IPC", () => {
  beforeEach(() => {
    electron.handlers.clear();
    vi.clearAllMocks();
  });

  it("returns a client connection descriptor for trusted main-frame senders", async () => {
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
    const descriptor = {
      endpoint: "http://127.0.0.1:1234/",
    } as HostConnectionDescriptor;
    const supervisor = localHostSupervisor(
      vi.fn().mockResolvedValue(descriptor),
    );
    registerLocalHostIpc({
      supervisor,
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
    });

    await expect(invoke(event())).resolves.toBe(descriptor);
    expect(supervisor.getClientConnection).toHaveBeenCalledTimes(1);
  });

  it("rejects arguments, subframes, detached windows, and untrusted senders", async () => {
    electron.BrowserWindow.fromWebContents.mockReturnValue({});
    const supervisor = localHostSupervisor(
      vi.fn<() => Promise<HostConnectionDescriptor>>(),
    );
    registerLocalHostIpc({
      supervisor,
      isTrustedSender: (url) => url.startsWith("spacezero://renderer"),
    });

    expect(() => invoke(event(), "unexpected")).toThrow(
      "invalid local host connection request",
    );
    expect(() =>
      invoke(
        event({ senderFrame: { url: "spacezero://renderer/frame.html" } }),
      ),
    ).toThrow("untrusted local host connection sender");
    electron.BrowserWindow.fromWebContents.mockReturnValueOnce(null);
    expect(() => invoke(event())).toThrow(
      "untrusted local host connection sender",
    );
    expect(() =>
      invoke(
        event({
          sender: { mainFrame: { url: "spacezero://renderer/index.html" } },
          senderFrame: { url: "https://evil.invalid/" },
        }),
      ),
    ).toThrow("untrusted local host connection sender");
    expect(supervisor.getClientConnection).not.toHaveBeenCalled();
  });
});
