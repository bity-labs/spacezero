import { ipcMain } from "electron";
import {
  assertTrustedMainFrame,
  type TrustedSenderPredicate,
} from "../trusted-ipc.js";
import type { LocalHostSupervisor } from "./local-host-supervisor.js";

export interface LocalHostIpcOptions {
  readonly supervisor: LocalHostSupervisor;
  readonly isTrustedSender: TrustedSenderPredicate;
}

export const registerLocalHostIpc = (
  options: LocalHostIpcOptions,
): (() => void) => {
  ipcMain.handle(
    "spacezero:get-local-host-connection",
    (event, ...args: readonly unknown[]) => {
      if (args.length !== 0)
        throw new Error("invalid local host connection request");
      assertTrustedMainFrame(
        event,
        options.isTrustedSender,
        "untrusted local host connection sender",
      );
      return options.supervisor.getClientConnection();
    },
  );
  return () => ipcMain.removeHandler("spacezero:get-local-host-connection");
};
