import { ipcMain, shell } from "electron";
import {
  assertTrustedMainFrame,
  type TrustedSenderPredicate,
} from "./trusted-ipc.js";

export interface ExternalUrlIpcOptions {
  readonly isTrustedSender: TrustedSenderPredicate;
  readonly openExternal?: (url: string) => Promise<unknown>;
}

const MAX_EXTERNAL_URL_BYTES = 4096;
const hasControlCharacter = (value: string): boolean => {
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

export const isSafeExternalUrl = (value: string): boolean => {
  if (
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_EXTERNAL_URL_BYTES ||
    hasControlCharacter(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};

export const registerExternalUrlIpc = (
  options: ExternalUrlIpcOptions,
): (() => void) => {
  const openExternal = options.openExternal ?? shell.openExternal;
  ipcMain.handle(
    "spacezero:open-external-url",
    async (
      event,
      ...args: readonly unknown[]
    ): Promise<{ status: "opened" }> => {
      if (args.length !== 1 || typeof args[0] !== "string")
        throw new Error("invalid external URL request");
      assertTrustedMainFrame(
        event,
        options.isTrustedSender,
        "untrusted external URL sender",
      );
      if (!isSafeExternalUrl(args[0]))
        throw new Error("invalid external URL request");
      await openExternal(args[0]);
      return { status: "opened" };
    },
  );
  return () => ipcMain.removeHandler("spacezero:open-external-url");
};
