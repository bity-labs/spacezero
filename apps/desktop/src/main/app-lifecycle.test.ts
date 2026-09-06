import { EventEmitter } from "node:events";
import type { App } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  BrowserWindow: {
    getAllWindows: vi.fn<() => unknown[]>(() => []),
  },
}));

vi.mock("electron", () => electron);

const { installAppLifecycle } = await import("./app-lifecycle.js");

const fakeApp = (): App & EventEmitter => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { quit: vi.fn() }) as unknown as App &
    EventEmitter;
};

const supervisor = () => ({
  start: vi.fn(),
  getClientConnection: vi.fn(),
  stop: vi.fn(async () => undefined),
  endpoint: vi.fn(),
});

describe("app lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electron.BrowserWindow.getAllWindows.mockReturnValue([]);
  });

  it("does not create an activate window before initial startup allows windows", () => {
    let canCreateWindow = false;
    const app = fakeApp();
    const createWindow = vi.fn();

    installAppLifecycle(app, createWindow, supervisor(), {
      canCreateWindow: () => canCreateWindow,
    });

    app.emit("activate");
    expect(createWindow).not.toHaveBeenCalled();

    canCreateWindow = true;
    app.emit("activate");
    expect(createWindow).toHaveBeenCalledTimes(1);
  });
});
