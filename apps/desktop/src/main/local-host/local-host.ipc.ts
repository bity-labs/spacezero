import { ipcMain } from "electron";
import type { LocalHostSupervisor } from "./local-host-supervisor.js";

export const registerLocalHostIpc = (supervisor: LocalHostSupervisor): void => {
  ipcMain.handle(
    "spacezero:get-local-host-connection",
    (_event, ...args: readonly unknown[]) => {
      if (args.length !== 0)
        throw new Error("invalid local host connection request");
      return supervisor.getClientConnection();
    },
  );
};
