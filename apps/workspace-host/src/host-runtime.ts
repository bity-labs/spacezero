import {
  HOST_PROTOCOL_VERSION,
  parseLocalHostReadyFrame,
} from "@spacezero/host-contracts";
import {
  createBootstrapAuthority,
  parseBootstrapFrameForAuthority,
} from "./runtime/bootstrap-authority.service.js";
import {
  readBoundedJsonFrame,
  waitForLifetimeEnd,
  writeJsonFrame,
} from "./runtime/bootstrap-channel.adapter.js";
import { startHostServer } from "./runtime/host-server.js";

export interface HostDiagnostic {
  readonly process: "workspace-host";
  readonly event: "startup" | "shutdown";
}
export const formatHostDiagnostic = (event: HostDiagnostic["event"]): string =>
  JSON.stringify({ process: "workspace-host", event } satisfies HostDiagnostic);

export const runProtectedHost = async (
  options: {
    readonly bootstrapFd?: number;
    readonly readyFd?: number;
    readonly lifetimeFd?: number;
    readonly databasePath?: string;
  } = {},
): Promise<void> => {
  const bootstrapFd = options.bootstrapFd ?? 3;
  const readyFd = options.readyFd ?? 4;
  const lifetimeFd = options.lifetimeFd ?? 5;
  const deadlineMs = Date.now() + 10_000;
  const rawFrame = await readBoundedJsonFrame(bootstrapFd);
  const frame = parseBootstrapFrameForAuthority(rawFrame);
  const bootstrap = createBootstrapAuthority({ frame, deadlineMs });
  let resolveHttpShutdown!: () => void;
  const httpShutdown = new Promise<void>((resolve) => {
    resolveHttpShutdown = resolve;
  });
  let resolveSignal!: () => void;
  const signal = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });
  const onSignal = (): void => {
    resolveSignal();
  };
  const lifetime = waitForLifetimeEnd(lifetimeFd);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const host = await startHostServer({
    allowedRendererOrigin: frame.allowedRendererOrigin,
    bootstrap,
    onShutdown: resolveHttpShutdown,
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
  });
  await writeJsonFrame(
    readyFd,
    parseLocalHostReadyFrame({
      endpoint: host.endpoint,
      instanceId: host.instanceId,
      protocolMin: HOST_PROTOCOL_VERSION,
      protocolMax: HOST_PROTOCOL_VERSION,
    }),
  );
  console.log(formatHostDiagnostic("startup"));
  try {
    await Promise.race([lifetime.done, signal, httpShutdown]);
  } finally {
    lifetime.close();
    await lifetime.done.catch(() => undefined);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await host.stop();
    console.log(formatHostDiagnostic("shutdown"));
  }
};
