import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

declare global {
  interface Window {
    readonly spacezero: {
      readonly getAppVersion: () => Promise<string>;
      readonly getLocalHostConnection: () => Promise<HostConnectionDescriptor>;
    };
  }
}

export {};
