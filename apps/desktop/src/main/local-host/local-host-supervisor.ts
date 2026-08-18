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
export const createLocalHostSupervisor = (): LocalHostSupervisor => {
  let launched: LaunchedLocalHost | undefined;
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const clearIfClosed = (host: LaunchedLocalHost): void => {
    host.closed.finally(() => {
      if (launched === host) launched = undefined;
    });
  };
  const supervisor: LocalHostSupervisor = {
    start: async (origin, spaceZeroHome) => {
      if (launched) return;
      starting ??= launchLocalHost(origin, spaceZeroHome)
        .then((value) => {
          launched = value;
          clearIfClosed(value);
        })
        .catch((error) => {
          starting = undefined;
          throw error;
        });
      await starting;
    },
    endpoint: () => launched?.ready.endpoint,
    getClientConnection: async () => {
      if (!launched) throw new LocalHostUnavailableError();
      try {
        const response = await fetch(
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
      stopping ??= (async () => {
        if (starting) await starting.catch(() => undefined);
        const current = launched;
        launched = undefined;
        starting = undefined;
        if (!current) return;
        await fetch(new URL("/v1/admin/shutdown", current.ready.endpoint), {
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
