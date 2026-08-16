import { Effect } from "effect";

export interface HostDiagnostic {
  readonly process: "workspace-host";
  readonly event: "startup" | "shutdown";
}

interface HostScope {
  readonly shutdown: Promise<void>;
  readonly dispose: () => void;
}

export const formatHostDiagnostic = (event: HostDiagnostic["event"]): string =>
  JSON.stringify({
    process: "workspace-host",
    event,
  } satisfies HostDiagnostic);

export const runScopedHost = Effect.acquireUseRelease(
  Effect.sync((): HostScope => {
    let resolveShutdown!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      resolveShutdown = resolve;
    });
    const onSignal = (): void => {
      resolveShutdown();
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    const keepAlive = setInterval(() => undefined, 60_000);
    console.log(formatHostDiagnostic("startup"));
    return {
      shutdown,
      dispose: () => {
        clearInterval(keepAlive);
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
      },
    };
  }),
  (scope) => Effect.promise(() => scope.shutdown),
  (scope) =>
    Effect.sync(() => {
      scope.dispose();
      console.log(formatHostDiagnostic("shutdown"));
    }),
);
