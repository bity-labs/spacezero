import { afterEach, describe, expect, it, vi } from "vitest";
import { withHostCallDebugLogging } from "./host-call-logging.js";

const debugGlobal = globalThis as typeof globalThis & {
  __SPACEZERO_DEBUG_HOST_CALLS__?: boolean;
};

describe("withHostCallDebugLogging", () => {
  afterEach(() => {
    debugGlobal.__SPACEZERO_DEBUG_HOST_CALLS__ = undefined;
    vi.restoreAllMocks();
  });

  it("does not log host calls unless debugging is enabled", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const fetch = withHostCallDebugLogging(fetchImpl as typeof globalThis.fetch);

    await fetch("http://127.0.0.1:1234/v1/projects?cursor=secret-ish");

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(debug).not.toHaveBeenCalled();
  });

  it("logs method, path, status, and duration without query strings or headers", async () => {
    debugGlobal.__SPACEZERO_DEBUG_HOST_CALLS__ = true;
    vi.spyOn(performance, "now").mockReturnValueOnce(10).mockReturnValueOnce(25);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 202 }));
    const fetch = withHostCallDebugLogging(fetchImpl as typeof globalThis.fetch);

    await fetch("http://127.0.0.1:1234/v1/global-chat-sessions?after=123", {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    });

    expect(debug).toHaveBeenNthCalledWith(1, "[spacezero:host] request", {
      method: "POST",
      path: "/v1/global-chat-sessions",
    });
    expect(debug).toHaveBeenNthCalledWith(2, "[spacezero:host] response", {
      method: "POST",
      path: "/v1/global-chat-sessions",
      status: 202,
      durationMs: 15,
    });
  });
});
