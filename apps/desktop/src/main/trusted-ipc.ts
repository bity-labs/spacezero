import { BrowserWindow, type IpcMainInvokeEvent } from "electron";

export type TrustedSenderPredicate = (url: string) => boolean;

export const assertTrustedMainFrame = (
  event: IpcMainInvokeEvent,
  isTrustedSender: TrustedSenderPredicate,
  message = "untrusted IPC sender",
): BrowserWindow => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const frame = event.senderFrame;
  const frameUrl = frame?.url;
  if (
    !window ||
    !frame ||
    !frameUrl ||
    frame !== event.sender.mainFrame ||
    !isTrustedSender(frameUrl)
  ) {
    throw new Error(message);
  }
  return window;
};
