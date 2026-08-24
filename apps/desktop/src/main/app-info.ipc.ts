import { app, ipcMain } from "electron";
import {
  assertTrustedMainFrame,
  type TrustedSenderPredicate,
} from "./trusted-ipc.js";

export interface AppInfoIpcOptions {
  readonly isTrustedSender: TrustedSenderPredicate;
  readonly getVersion?: () => string;
}

export const registerAppInfoIpc = (
  options: AppInfoIpcOptions,
): (() => void) => {
  const getVersion = options.getVersion ?? app.getVersion;
  ipcMain.handle(
    "spacezero:get-app-version",
    (event, ...args: readonly unknown[]) => {
      if (args.length !== 0) throw new Error("invalid app version request");
      assertTrustedMainFrame(
        event,
        options.isTrustedSender,
        "untrusted app version sender",
      );
      return getVersion();
    },
  );
  return () => ipcMain.removeHandler("spacezero:get-app-version");
};
