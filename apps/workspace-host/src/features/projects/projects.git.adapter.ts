import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { basename, normalize, sep } from "node:path";
import type { ProjectErrorCode } from "@spacezero/host-contracts";
import type { InspectedRepository } from "./project.model.js";

export class ProjectInspectionError extends Error {
  constructor(readonly code: ProjectErrorCode) {
    super(code);
  }
}

const outputLimit = 64 * 1024;
const timeoutMs = 10_000;
const forceKillDelayMs = 200;
const invalidPath = (): never => {
  throw new ProjectInspectionError("invalid_project_path");
};
const notGit = (): never => {
  throw new ProjectInspectionError("not_git_repository");
};
const noCommit = (): never => {
  throw new ProjectInspectionError("repository_has_no_commit");
};

const abortError = () => {
  const error = new Error("Git inspection was aborted");
  error.name = "AbortError";
  return error;
};

const git = (
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    const timers: {
      timeout?: NodeJS.Timeout;
      forceKill?: NodeJS.Timeout;
    } = {};
    const cleanup = () => {
      if (timers.timeout) clearTimeout(timers.timeout);
      if (timers.forceKill) clearTimeout(timers.forceKill);
      signal?.removeEventListener("abort", abort);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const resolveOnce = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const child = execFile(
      "git",
      ["-C", cwd, ...args],
      {
        shell: false,
        maxBuffer: outputLimit,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          SystemRoot: process.env.SystemRoot,
        },
      },
      (error, stdout) => {
        if (error) rejectOnce(error);
        else resolveOnce(stdout.trim());
      },
    );
    const kill = () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      timers.forceKill = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, forceKillDelayMs);
      timers.forceKill.unref();
    };
    function abort() {
      kill();
      child.once("close", () => rejectOnce(abortError()));
    }
    child.stdin?.destroy();
    signal?.addEventListener("abort", abort, { once: true });
    timers.timeout = setTimeout(() => {
      kill();
      child.once("close", () => rejectOnce(new Error("git timed out")));
    }, timeoutMs);
    timers.timeout.unref();
  });

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
