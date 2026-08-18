import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { type WriteStream } from "node:fs";
import {
  HOST_PROTOCOL_VERSION,
  parseLocalHostBootstrapResult,
  parseLocalHostReadyFrame,
  type LocalHostBootstrapFrame,
  type LocalHostReadyFrame,
} from "@spacezero/host-contracts";
import { resolveLocalHostExecutable } from "./local-host-executable.js";

export interface LaunchedLocalHost {
  readonly child: ChildProcessWithoutNullStreams;
  readonly ready: LocalHostReadyFrame;
  readonly supervisorCapability: string;
  readonly lifetime: WriteStream;
  readonly closed: Promise<void>;
  readonly stop: () => Promise<void>;
}
const readFrame = async (
  stream: NodeJS.ReadableStream,
  closed: Promise<void>,
  timeoutMs = 10_000,
): Promise<unknown> => {
  let data = "";
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("ready timeout")), timeoutMs);
  });
  const readPromise = (async () => {
    for await (const chunk of stream) {
      data += String(chunk);
      if (data.length > 8192) throw new Error("ready too large");
      if (data.includes("\n")) break;
    }
    const line = data.split("\n")[0];
    if (!line) throw new Error("missing ready frame");
    return JSON.parse(line) as unknown;
  })();
  try {
    return await Promise.race([
      readPromise,
      timeoutPromise,
      closed.then(() => {
        throw new Error("host exited before ready");
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
const waitForClose = (child: ChildProcessWithoutNullStreams): Promise<void> =>
  child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : once(child, "close").then(() => undefined);
const safeEnd = (stream: WriteStream, chunk?: string): void => {
  stream.on("error", () => undefined);
  if (!stream.destroyed) stream.end(chunk);
};
export const launchLocalHost = async (
  allowedRendererOrigin: string,
  spaceZeroHome: string,
): Promise<LaunchedLocalHost> => {
  const executable = resolveLocalHostExecutable();
  const child = spawn(executable.nodeExecutable, [executable.hostEntry], {
    cwd: executable.cwd,
    env: { PATH: process.env.PATH ?? "" },
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams & { readonly stdio: readonly unknown[] };
  child.stdout.resume();
  child.stderr.resume();
  child.on("error", () => undefined);
  const closed = waitForClose(child);
  const lifetime = child.stdio[5] as WriteStream;
  try {
    const bootstrapSecret = randomBytes(32).toString("base64url");
    const frame: LocalHostBootstrapFrame = {
      bootstrapSecret,
      issuedAt: new Date().toISOString(),
      allowedRendererOrigin,
      spaceZeroHome,
      protocolMin: HOST_PROTOCOL_VERSION,
      protocolMax: HOST_PROTOCOL_VERSION,
    };
    safeEnd(child.stdio[3] as WriteStream, `${JSON.stringify(frame)}\n`);
    const ready = parseLocalHostReadyFrame(
      await readFrame(child.stdio[4] as NodeJS.ReadableStream, closed),
    );
    const bootstrapResponse = await fetch(
      new URL("/v1/bootstrap", ready.endpoint),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${bootstrapSecret}` },
      },
    );
    if (!bootstrapResponse.ok) throw new Error("bootstrap exchange failed");
    const { supervisorCapability } = parseLocalHostBootstrapResult(
      await bootstrapResponse.json(),
    );
    let stopping: Promise<void> | undefined;
    const stop = async (): Promise<void> => {
      stopping ??= (async () => {
        safeEnd(lifetime, "shutdown\n");
        if (child.exitCode === null && child.signalCode === null) {
          const sigterm = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null)
              child.kill("SIGTERM");
          }, 1000);
          const sigkill = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null)
              child.kill("SIGKILL");
          }, 5000);
          try {
            await closed;
          } finally {
            clearTimeout(sigterm);
            clearTimeout(sigkill);
          }
        }
      })();
      await stopping;
    };
    return { child, ready, supervisorCapability, lifetime, closed, stop };
  } catch (error) {
    safeEnd(lifetime, "shutdown\n");
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await closed.catch(() => undefined);
    throw error;
  }
};
