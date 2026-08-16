import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOST_PROTOCOL_VERSION,
  type LocalHostBootstrapFrame,
  parseLocalHostReadyFrame,
} from "@spacezero/host-contracts";
import {
  killIfRunning,
  readLine,
  waitForProcessExit,
} from "./process-helpers.js";

const startHost = async () => {
  const child = spawn(process.execPath, [join(process.cwd(), "dist/main.js")], {
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
  }) as ChildProcess & { readonly stdio: readonly unknown[] };
  const bootstrapSecret = "test-secret-abcdefghijklmnopqrstuvwxyz0123456789";
  const frame: LocalHostBootstrapFrame = {
    bootstrapSecret,
    issuedAt: new Date().toISOString(),
    allowedRendererOrigin: "spacezero://renderer",
    protocolMin: HOST_PROTOCOL_VERSION,
    protocolMax: HOST_PROTOCOL_VERSION,
  };
  (child.stdio[3] as NodeJS.WritableStream).end(`${JSON.stringify(frame)}\n`);
  const readyText = await readLine(child.stdio[4] as NodeJS.ReadableStream);
  return {
    child,
    ready: parseLocalHostReadyFrame(JSON.parse(readyText) as unknown),
    bootstrapSecret,
    lifetime: child.stdio[5] as NodeJS.WritableStream,
  };
};

describe("workspace host process", () => {
  it("reports package foundation version without Host Protocol semantics", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist/main.js"), "--version"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("spacezero-workspace-host 0.0.0");
  });

  it("starts only after protected bootstrap and shuts down cleanly on lifetime EOF", async () => {
    const { child, ready, bootstrapSecret, lifetime } = await startHost();
    const stdout: string[] = [];
    const stderr: string[] = [];
    (child.stdout as NodeJS.ReadableStream).on("data", (chunk) =>
      stdout.push(String(chunk)),
    );
    (child.stderr as NodeJS.ReadableStream).on("data", (chunk) =>
      stderr.push(String(chunk)),
    );
    try {
      expect(ready.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      expect(Object.keys(ready)).not.toContain("supervisorCapability");
      lifetime.end();
      const [code, signal] = await waitForProcessExit(child, 5000);
      expect([code, signal]).toEqual([0, null]);
      expect(`${stdout.join("")} ${stderr.join("")}`).not.toContain(
        bootstrapSecret,
      );
    } finally {
      await killIfRunning(child);
    }
  });

  it("does not require forced termination after protected lifetime closes", async () => {
    const { child, lifetime } = await startHost();
    try {
      lifetime.end();
      const [code, signal] = await waitForProcessExit(child, 5000);
      expect([code, signal]).toEqual([0, null]);
    } finally {
      await killIfRunning(child);
    }
  });

  it("shuts down cleanly on SIGTERM", async () => {
    const { child } = await startHost();
    try {
      child.kill("SIGTERM");
      const [code, signal] = await waitForProcessExit(child, 5000);
      expect([code, signal]).toEqual([0, null]);
    } finally {
      await killIfRunning(child);
    }
  });
});
