import {
  parseHostConnectionDescriptor,
  type HostConnectionDescriptor,
} from "@spacezero/host-contracts";
import {
  launchLocalHost,
  type LaunchedLocalHost,
} from "./local-host-launcher.js";
import { LocalHostUnavailableError } from "./local-host-executable.js";

export interface LocalHostSupervisor {
  readonly start: (
    allowedRendererOrigin: string,
    spaceZeroHome: string,
  ) => Promise<void>;
  readonly getClientConnection: () => Promise<HostConnectionDescriptor>;
  readonly stop: () => Promise<void>;
  readonly endpoint: () => string | undefined;
}

interface LocalHostStartConfiguration {
  readonly allowedRendererOrigin: string;
  readonly spaceZeroHome: string;
}

type LaunchLocalHost = typeof launchLocalHost;
type RestartTimer = ReturnType<typeof setTimeout>;

export interface LocalHostSupervisorOptions {
  readonly launch?: LaunchLocalHost;
  readonly fetch?: typeof globalThis.fetch;
  readonly setTimeout?: (callback: () => void, delayMs: number) => RestartTimer;
  readonly clearTimeout?: (timer: RestartTimer) => void;
  readonly restartBackoffMs?: readonly number[];
}

const DEFAULT_RESTART_BACKOFF_MS = [250, 1_000, 5_000, 15_000] as const;

export const createLocalHostSupervisor = (
  options: LocalHostSupervisorOptions = {},
): LocalHostSupervisor => {
  const launch = options.launch ?? launchLocalHost;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const setRestartTimeout = options.setTimeout ?? setTimeout;
  const clearRestartTimeout = options.clearTimeout ?? clearTimeout;
  const restartBackoffMs =
    options.restartBackoffMs && options.restartBackoffMs.length > 0
      ? options.restartBackoffMs
      : DEFAULT_RESTART_BACKOFF_MS;

  let launched: LaunchedLocalHost | undefined;
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let configuration: LocalHostStartConfiguration | undefined;
  let restartTimer: RestartTimer | undefined;
  let restartAttempts = 0;
  let explicitStop = false;

  const clearRestartTimer = (): void => {
    if (!restartTimer) return;
    clearRestartTimeout(restartTimer);
    restartTimer = undefined;
  };

  const scheduleRestart = (): void => {
    if (explicitStop || stopping || !configuration || restartTimer) return;
    if (restartAttempts >= restartBackoffMs.length) return;
    const delayMs =
      restartBackoffMs[restartAttempts] ?? restartBackoffMs.at(-1)!;
    restartAttempts += 1;
    restartTimer = setRestartTimeout(() => {
      restartTimer = undefined;
      if (explicitStop || stopping || !configuration || launched || starting)
        return;
      void startConfigured(configuration).catch(() => undefined);
    }, delayMs);
  };

  const monitorUnexpectedClose = (host: LaunchedLocalHost): void => {
    host.closed.finally(() => {
      if (launched !== host) return;
      launched = undefined;
      scheduleRestart();
    });
  };

  const startConfigured = async (
    currentConfiguration: LocalHostStartConfiguration,
  ): Promise<void> => {
    if (launched) return;
    clearRestartTimer();
    let launchFailed = false;
    starting ??= launch(
      currentConfiguration.allowedRendererOrigin,
      currentConfiguration.spaceZeroHome,
    )
      .then((value) => {
        if (explicitStop) {
          return value.stop();
        }
        launched = value;
        monitorUnexpectedClose(value);
      })
      .catch((error) => {
        launchFailed = true;
        throw error;
      })
      .finally(() => {
        starting = undefined;
        if (!explicitStop && !stopping && (launchFailed || !launched))
          scheduleRestart();
      });
    await starting;
  };

  const supervisor: LocalHostSupervisor = {
    start: async (origin, spaceZeroHome) => {
      configuration = { allowedRendererOrigin: origin, spaceZeroHome };
      explicitStop = false;
      restartAttempts = 0;
      await startConfigured(configuration);
    },
    endpoint: () => launched?.ready.endpoint,
    getClientConnection: async () => {
      if (!launched) throw new LocalHostUnavailableError();
      try {
        const response = await fetchImpl(
          new URL("/v1/admin/client-capabilities", launched.ready.endpoint),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${launched.supervisorCapability}`,
            },
          },
        );
        if (!response.ok) throw new LocalHostUnavailableError();
        return parseHostConnectionDescriptor(await response.json());
      } catch {
        throw new LocalHostUnavailableError();
      }
    },
    stop: async () => {
      explicitStop = true;
      clearRestartTimer();
      stopping ??= (async () => {
        if (starting) await starting.catch(() => undefined);
        const current = launched;
        launched = undefined;
        starting = undefined;
        configuration = undefined;
        restartAttempts = 0;
        if (!current) return;
        await fetchImpl(new URL("/v1/admin/shutdown", current.ready.endpoint), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${current.supervisorCapability}`,
          },
        }).catch(() => undefined);
        await current.stop();
      })().finally(() => {
        stopping = undefined;
      });
      await stopping;
    },
  };
  return supervisor;
};
