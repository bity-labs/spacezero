import {
  LOCAL_HOST_CLIENT_SCOPES,
  type HostConnectionDescriptor,
} from "@spacezero/host-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LaunchedLocalHost } from "./local-host-launcher.js";
import { LocalHostUnavailableError } from "./local-host-executable.js";
import { createLocalHostSupervisor } from "./local-host-supervisor.js";

const descriptor = (
  endpoint: string,
  capability: string,
): HostConnectionDescriptor => ({
  endpoint,
  instanceId: capability === "second" ? "b".repeat(32) : "a".repeat(32),
  protocolVersion: "4",
  clientCapability: `client-${capability}`.padEnd(32, "x"),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  scopes: LOCAL_HOST_CLIENT_SCOPES,
});

interface ControlledHost {
  readonly host: LaunchedLocalHost;
  readonly close: () => void;
  readonly stop: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

const controlledHost = (
  endpoint: string,
  supervisorCapability: string,
): ControlledHost => {
  let close!: () => void;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  const stop = vi.fn(async () => {
    close();
  });
  return {
    close,
    stop,
    host: {
      child: {} as LaunchedLocalHost["child"],
      ready: {
        endpoint,
        instanceId: "c".repeat(32),
        protocolMin: "4",
        protocolMax: "4",
      },
      supervisorCapability,
      lifetime: {} as LaunchedLocalHost["lifetime"],
      closed,
      stop,
    },
  };
};

const createManualTimers = () => {
  const timers: { readonly callback: () => void; readonly delayMs: number }[] =
    [];
  return {
    timers,
    setTimeout: (callback: () => void, delayMs: number) => {
      const timer = { callback, delayMs };
      timers.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => {
      const index = timers.indexOf(timer as unknown as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
    runNext: () => {
      const timer = timers.shift();
      if (!timer) throw new Error("missing timer");
      timer.callback();
      return timer.delayMs;
    },
  };
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("Local Host supervisor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("restarts unexpected exits with backoff and fresh authorization", async () => {
    const timers = createManualTimers();
    const first = controlledHost("http://127.0.0.1:1111/", "first");
    const second = controlledHost("http://127.0.0.1:2222/", "second");
    const launch = vi
      .fn<() => Promise<LaunchedLocalHost>>()
      .mockResolvedValueOnce(first.host)
      .mockResolvedValueOnce(second.host);
    const fetchMock = vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: RequestInit,
      ) => {
        const url = String(input);
        const authorization = new Headers(init?.headers).get("authorization");
        return new Response(
          JSON.stringify(
            descriptor(
              url.startsWith(second.host.ready.endpoint)
                ? second.host.ready.endpoint
                : first.host.ready.endpoint,
              authorization === "Bearer second" ? "second" : "first",
            ),
          ),
          { headers: { "content-type": "application/json" } },
        );
      },
    );
    const supervisor = createLocalHostSupervisor({
      launch,
      fetch: fetchMock as typeof globalThis.fetch,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      restartBackoffMs: [10, 20],
    });

    await supervisor.start("spacezero://renderer", "/space-zero-home");
    expect(supervisor.endpoint()).toBe(first.host.ready.endpoint);

    first.close();
    await flush();
    expect(supervisor.endpoint()).toBeUndefined();
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([10]);

    expect(timers.runNext()).toBe(10);
    await flush();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(launch).toHaveBeenLastCalledWith(
      "spacezero://renderer",
      "/space-zero-home",
    );
    expect(supervisor.endpoint()).toBe(second.host.ready.endpoint);

    await expect(supervisor.getClientConnection()).resolves.toMatchObject({
      endpoint: second.host.ready.endpoint,
      clientCapability: expect.stringContaining("second"),
    });
    const capabilityRequest = fetchMock.mock.calls.at(-1);
    expect(String(capabilityRequest?.[0])).toBe(
      "http://127.0.0.1:2222/v1/admin/client-capabilities",
    );
    expect(
      new Headers(capabilityRequest?.[1]?.headers).get("authorization"),
    ).toBe("Bearer second");
  });

  it("schedules restart when a Host closes immediately after launch", async () => {
    const timers = createManualTimers();
    const first = controlledHost("http://127.0.0.1:2221/", "first");
    const second = controlledHost("http://127.0.0.1:2222/", "second");
    const launch = vi
      .fn<() => Promise<LaunchedLocalHost>>()
      .mockImplementationOnce(async () => {
        first.close();
        return first.host;
      })
      .mockResolvedValueOnce(second.host);
    const supervisor = createLocalHostSupervisor({
      launch,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      restartBackoffMs: [10],
    });

    await supervisor.start("spacezero://renderer", "/space-zero-home");
    await flush();
    expect(supervisor.endpoint()).toBeUndefined();
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([10]);

    timers.runNext();
    await flush();
    expect(supervisor.endpoint()).toBe(second.host.ready.endpoint);
  });

  it("does not restart after explicit stop", async () => {
    const timers = createManualTimers();
    const host = controlledHost("http://127.0.0.1:3333/", "explicit");
    const launch = vi.fn(async () => host.host);
    const fetchMock = vi.fn(async () => new Response("{}"));
    const supervisor = createLocalHostSupervisor({
      launch,
      fetch: fetchMock as typeof globalThis.fetch,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      restartBackoffMs: [10],
    });

    await supervisor.start("spacezero://renderer", "/space-zero-home");
    await supervisor.stop();
    await flush();

    expect(host.stop).toHaveBeenCalledTimes(1);
    expect(timers.timers).toEqual([]);
    expect(launch).toHaveBeenCalledTimes(1);
    await expect(supervisor.getClientConnection()).rejects.toBeInstanceOf(
      LocalHostUnavailableError,
    );
  });

  it("bounds repeated unexpected crash restarts", async () => {
    const timers = createManualTimers();
    const first = controlledHost("http://127.0.0.1:4441/", "one");
    const second = controlledHost("http://127.0.0.1:4442/", "two");
    const third = controlledHost("http://127.0.0.1:4443/", "three");
    const launch = vi
      .fn<() => Promise<LaunchedLocalHost>>()
      .mockResolvedValueOnce(first.host)
      .mockResolvedValueOnce(second.host)
      .mockResolvedValueOnce(third.host);
    const supervisor = createLocalHostSupervisor({
      launch,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      restartBackoffMs: [5, 15],
    });

    await supervisor.start("spacezero://renderer", "/space-zero-home");
    first.close();
    await flush();
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([5]);

    timers.runNext();
    await flush();
    second.close();
    await flush();
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([15]);

    timers.runNext();
    await flush();
    third.close();
    await flush();
    expect(timers.timers).toEqual([]);
    expect(supervisor.endpoint()).toBeUndefined();
    expect(launch).toHaveBeenCalledTimes(3);
  });

  it("does not spin unbounded after startup failures", async () => {
    const timers = createManualTimers();
    const launch = vi
      .fn<() => Promise<LaunchedLocalHost>>()
      .mockRejectedValue(new Error("boom"));
    const supervisor = createLocalHostSupervisor({
      launch,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      restartBackoffMs: [5, 15],
    });

    await expect(
      supervisor.start("spacezero://renderer", "/space-zero-home"),
    ).rejects.toThrow("boom");
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([5]);

    timers.runNext();
    await flush();
    expect(timers.timers.map((timer) => timer.delayMs)).toEqual([15]);

    timers.runNext();
    await flush();
    expect(timers.timers).toEqual([]);
    expect(launch).toHaveBeenCalledTimes(3);
  });
});
