import { realpath, stat } from "node:fs/promises";
import { basename, normalize, sep } from "node:path";
import type { ProjectErrorCode } from "@spacezero/host-contracts";
import { runGit } from "../../runtime/git-process.adapter.js";
import type { InspectedRepository } from "./project.model.js";

export class ProjectInspectionError extends Error {
  constructor(readonly code: ProjectErrorCode) {
    super(code);
  }
}

const invalidPath = (): never => {
  throw new ProjectInspectionError("invalid_project_path");
};
const notGit = (): never => {
  throw new ProjectInspectionError("not_git_repository");
};
const noCommit = (): never => {
  throw new ProjectInspectionError("repository_has_no_commit");
};

const git = (cwd: string, args: readonly string[], signal?: AbortSignal) =>
  runGit({ cwd, args, signal });

const fileIdentity = async (path: string) => {
  const value = await stat(path, { bigint: true });
  return {
    deviceId: value.dev.toString(10),
    fileId: value.ino.toString(10),
    isDirectory: value.isDirectory(),
  };
};
const isInsideDotGit = (path: string): boolean =>
  normalize(path).split(sep).includes(".git");

export const inspectGitRepository = async (
  selectedPath: string,
  signal?: AbortSignal,
): Promise<InspectedRepository> => {
  if (
    selectedPath.length === 0 ||
    selectedPath.includes("\0") ||
    Buffer.byteLength(selectedPath, "utf8") > 4096 ||
    !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(selectedPath)
  )
    invalidPath();

  let selectedRealPath = "";
  try {
    selectedRealPath = await realpath(selectedPath);
    const selected = await fileIdentity(selectedRealPath);
    if (!selected.isDirectory) invalidPath();
  } catch {
    invalidPath();
  }
  if (isInsideDotGit(selectedRealPath)) notGit();

  let canonicalRootPath = "";
  let canonicalGitDirPath = "";
  let canonicalGitCommonDirPath = "";
  try {
    canonicalRootPath = await realpath(
      await git(selectedRealPath, ["rev-parse", "--show-toplevel"], signal),
    );
    canonicalGitDirPath = await realpath(
      await git(selectedRealPath, ["rev-parse", "--absolute-git-dir"], signal),
    );
    canonicalGitCommonDirPath = await realpath(
      await git(
        selectedRealPath,
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        signal,
      ),
    );
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw error;
    notGit();
  }

  let headCommit = "";
  try {
    headCommit = (
      await git(
        canonicalRootPath,
        ["rev-parse", "--verify", "HEAD^{commit}"],
        signal,
      )
    ).toLowerCase();
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") throw error;
    noCommit();
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(headCommit)) noCommit();

  const root = await fileIdentity(canonicalRootPath);
  const common = await fileIdentity(canonicalGitCommonDirPath);
  if (!root.isDirectory || !common.isDirectory) invalidPath();

  return {
    canonicalRootPath,
    canonicalGitDirPath,
    canonicalGitCommonDirPath,
    rootDeviceId: root.deviceId,
    rootFileId: root.fileId,
    commonDirDeviceId: common.deviceId,
    commonDirFileId: common.fileId,
    headCommit,
    displayName: basename(canonicalRootPath) || canonicalRootPath,
  };
};
