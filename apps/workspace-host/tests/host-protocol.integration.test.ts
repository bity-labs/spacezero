import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOST_PROTOCOL_VERSION,
  type HostConnectionDescriptor,
  type LocalHostBootstrapFrame,
  parseHostConnectionDescriptor,
  parseLocalHostBootstrapResult,
  parseLocalHostReadyFrame,
} from "@spacezero/host-contracts";
import {
  killIfRunning,
  readLine,
  waitForProcessExit,
} from "./process-helpers.js";

const start = async (origin = "spacezero://renderer") => {
  const child = spawn(process.execPath, [join(process.cwd(), "dist/main.js")], {
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
  }) as ChildProcess & { readonly stdio: readonly unknown[] };
  const bootstrapSecret = `secret-${randomUUID()}-abcdefghijklmnop`;
  const frame: LocalHostBootstrapFrame = {
    bootstrapSecret,
    issuedAt: new Date().toISOString(),
    allowedRendererOrigin: origin,
    protocolMin: HOST_PROTOCOL_VERSION,
    protocolMax: HOST_PROTOCOL_VERSION,
  };
  (child.stdio[3] as NodeJS.WritableStream).end(`${JSON.stringify(frame)}\n`);
  const ready = parseLocalHostReadyFrame(
    JSON.parse(
      await readLine(child.stdio[4] as NodeJS.ReadableStream),
    ) as unknown,
  );
  const bootstrap = await fetch(new URL("/v1/bootstrap", ready.endpoint), {
    method: "POST",
    headers: { Authorization: `Bearer ${bootstrapSecret}` },
  });
  expect(bootstrap.status).toBe(200);
  const { supervisorCapability } = parseLocalHostBootstrapResult(
    await bootstrap.json(),
  );
  return {
    child,
    ready,
    supervisorCapability,
    bootstrapSecret,
    lifetime: child.stdio[5] as NodeJS.WritableStream,
    origin,
  };
};
const mint = async (
  endpoint: string,
  supervisor: string,
): Promise<HostConnectionDescriptor> => {
  const response = await fetch(
    new URL("/v1/admin/client-capabilities", endpoint),
    { method: "POST", headers: { Authorization: `Bearer ${supervisor}` } },
  );
  expect(response.status).toBe(200);
  return parseHostConnectionDescriptor(await response.json());
};

describe("workspace host protocol", () => {
  it("denies replayed bootstrap, unauthenticated, wrong-origin, and wrong-scope requests with exact CORS", async () => {
    const host = await start();
    try {
      expect(
        (
          await fetch(new URL("/v1/bootstrap", host.ready.endpoint), {
            method: "POST",
            headers: { Authorization: `Bearer ${host.bootstrapSecret}` },
          })
        ).status,
      ).toBe(401);
      const unauth = await fetch(
        new URL("/v1/connection", host.ready.endpoint),
        {
          headers: { Origin: host.origin },
        },
      );
      expect(unauth.status).toBe(401);
      expect(unauth.headers.get("access-control-allow-origin")).toBe(
        host.origin,
      );
      const descriptor = await mint(
        host.ready.endpoint,
        host.supervisorCapability,
      );
      expect(
        (
          await fetch(new URL("/v1/connection", descriptor.endpoint), {
            headers: {
              Authorization: `Bearer ${descriptor.clientCapability}`,
              Origin: "null",
            },
          })
        ).headers.get("access-control-allow-origin"),
      ).toBeNull();
      expect(
        (
          await fetch(new URL("/v1/connection", descriptor.endpoint), {
            headers: {
              Authorization: `Bearer ${descriptor.clientCapability}`,
              Origin: "null",
            },
          })
        ).status,
      ).toBe(403);
      const scopeDenied = await fetch(
        new URL("/v1/admin/client-capabilities", descriptor.endpoint),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${descriptor.clientCapability}`,
            Origin: host.origin,
          },
        },
      );
      expect(scopeDenied.status).toBe(403);
      expect(scopeDenied.headers.get("access-control-allow-origin")).toBe(
        host.origin,
      );
      expect(await scopeDenied.json()).toEqual({
        code: "forbidden",
        message: "forbidden",
      });
      expect(
        (
          await fetch(new URL("/v1/events", descriptor.endpoint), {
            headers: {
              Authorization: "Bearer malformed",
              Origin: host.origin,
            },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(
            new URL("/v1/connection?token=abc", descriptor.endpoint),
            { headers: { Origin: host.origin } },
          )
        ).status,
      ).toBe(401);
      const preflight = await fetch(
        new URL("/v1/connection", descriptor.endpoint),
        {
          method: "OPTIONS",
          headers: {
            Origin: host.origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
          },
        },
      );
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(
        host.origin,
      );
    } finally {
      host.lifetime.end();
      await waitForProcessExit(host.child, 5000);
      await killIfRunning(host.child);
    }
  });

  it("mints a fixed client capability, answers query, streams one authenticated SSE event, and shuts down cleanly", async () => {
    const host = await start();
    try {
      const descriptor = await mint(
        host.ready.endpoint,
        host.supervisorCapability,
      );
      expect(descriptor.scopes).toEqual([
        "host:connection:read",
        "host:events:subscribe",
      ]);
      const query = await fetch(
        new URL("/v1/connection", descriptor.endpoint),
        {
          headers: {
            Authorization: `Bearer ${descriptor.clientCapability}`,
            Origin: host.origin,
          },
        },
      );
      expect(query.status).toBe(200);
      expect(await query.json()).toEqual({
        instanceId: descriptor.instanceId,
        protocolVersion: "1",
        status: "ready",
      });
      const events = await fetch(new URL("/v1/events", descriptor.endpoint), {
        headers: {
          Authorization: `Bearer ${descriptor.clientCapability}`,
          Origin: host.origin,
        },
      });
      expect(events.status).toBe(200);
      expect(events.headers.get("content-type")).toContain("text/event-stream");
      const reader = events.body!.getReader();
      const chunk = await reader.read();
      await reader.cancel();
      expect(new TextDecoder().decode(chunk.value)).toContain("host.connected");
      const shutdown = await fetch(
        new URL("/v1/admin/shutdown", descriptor.endpoint),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${host.supervisorCapability}`,
          },
        },
      );
      expect(shutdown.status).toBe(200);
      const [code, signal] = await waitForProcessExit(host.child, 5000);
      expect([code, signal]).toEqual([0, null]);
    } finally {
      await killIfRunning(host.child);
    }
  });
});
