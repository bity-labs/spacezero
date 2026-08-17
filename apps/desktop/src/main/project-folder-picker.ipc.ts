import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";

export type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

export interface ProjectFolderPickerOptions {
  readonly isTrustedSender: (url: string) => boolean;
  readonly showOpenDialog?: typeof dialog.showOpenDialog;
}

const assertTrusted = (
  event: IpcMainInvokeEvent,
  isTrustedSender: (url: string) => boolean,
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
  )
    throw new Error("untrusted project folder picker sender");
  return window;
};

export const registerProjectFolderPickerIpc = (
  options: ProjectFolderPickerOptions,
): (() => void) => {
  const showOpenDialog = options.showOpenDialog ?? dialog.showOpenDialog;
  ipcMain.handle(
    "spacezero:select-project-folder",
    async (
      event,
      ...args: readonly unknown[]
    ): Promise<ProjectFolderPickerResult> => {
      if (args.length !== 0)
        throw new Error("invalid project folder picker request");
      const window = assertTrusted(event, options.isTrustedSender);
      const result = await showOpenDialog(window, {
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0)
        return { status: "cancelled" };
      return { status: "selected", path: result.filePaths[0]! };
    },
  );
  return () => ipcMain.removeHandler("spacezero:select-project-folder");
};
