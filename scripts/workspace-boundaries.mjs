export const workspaces = {
  "@spacezero/desktop": {
    path: "apps/desktop",
    kind: "app",
    browserSafe: false,
    allowed: ["@spacezero/client-runtime", "@spacezero/host-contracts"],
  },
  "@spacezero/workspace-host": {
    path: "apps/workspace-host",
    kind: "app",
    browserSafe: false,
    allowed: ["@spacezero/host-contracts", "@spacezero/pi-adapter"],
  },
  "@spacezero/host-contracts": {
    path: "packages/host-contracts",
    kind: "package",
    browserSafe: true,
    allowed: [],
  },
  "@spacezero/client-runtime": {
    path: "packages/client-runtime",
    kind: "package",
    browserSafe: true,
    allowed: ["@spacezero/host-contracts"],
  },
  "@spacezero/pi-adapter": {
    path: "packages/pi-adapter",
    kind: "package",
    browserSafe: false,
    metadataOnly: false,
    allowed: [],
  },
};
export const inactivePaths = ["apps/handbook", "packages/ui"];
export const exactEffectVersion = "4.0.0-rc.109";
