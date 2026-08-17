import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

declare global {
  interface Window {
    readonly spacezero: {
      readonly getAppVersion: () => Promise<string>;
      readonly getLocalHostConnection: () => Promise<HostConnectionDescriptor>;
      readonly selectProjectFolder: () => Promise<ProjectFolderPickerResult>;
    };
  }
}

export {};
