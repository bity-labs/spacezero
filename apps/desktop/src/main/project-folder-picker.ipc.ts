import { dialog, ipcMain } from "electron";
import {
  assertTrustedMainFrame,
  type TrustedSenderPredicate,
} from "./trusted-ipc.js";

export type ProjectFolderPickerResult =
  | { readonly status: "selected"; readonly path: string }
  | { readonly status: "cancelled" };

export interface ProjectFolderPickerOptions {
  readonly isTrustedSender: TrustedSenderPredicate;
  readonly showOpenDialog?: typeof dialog.showOpenDialog;
}

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
      const window = assertTrustedMainFrame(
        event,
        options.isTrustedSender,
        "untrusted project folder picker sender",
      );
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
