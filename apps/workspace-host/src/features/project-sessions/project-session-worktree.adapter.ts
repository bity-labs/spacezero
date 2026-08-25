import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { runGit } from "../../runtime/git-process.adapter.js";
import type { AuthenticatedProjectRepository } from "../projects/project.model.js";
import {
  ProjectSessionServiceError,
  type PreparedWorktreeIdentity,
} from "./project-session.model.js";

const fileIdentity = async (path: string) => {
  const value = await stat(path, { bigint: true });
  return {
    deviceId: value.dev.toString(10),
    fileId: value.ino.toString(10),
    isDirectory: value.isDirectory(),
  };
};

const isWithin = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
};

export const createManagedWorktree = async (input: {
  readonly project: AuthenticatedProjectRepository;
  readonly worktreePath: string;
  readonly managedBranch: string;
  readonly sourceCommit: string;
}): Promise<PreparedWorktreeIdentity> => {
  try {
    await runGit({
      cwd: input.project.canonicalRootPath,
      args: [
        "worktree",
        "add",
        "-b",
        input.managedBranch,
        input.worktreePath,
        input.sourceCommit,
      ],
    });
    return await authenticateManagedWorktree(input);
  } catch (error) {
    if (error instanceof ProjectSessionServiceError) throw error;
    throw new ProjectSessionServiceError("session_provisioning_failed");
  }
};

export const authenticateManagedWorktree = async (input: {
  readonly project: AuthenticatedProjectRepository;
  readonly worktreePath: string;
  readonly managedBranch: string;
  readonly sourceCommit: string;
}): Promise<PreparedWorktreeIdentity> => {
  try {
    const canonicalWorktreePath = await realpath(input.worktreePath);
    const canonicalRoot = await realpath(
      await runGit({
        cwd: canonicalWorktreePath,
        args: ["rev-parse", "--show-toplevel"],
      }),
    );
    const canonicalGitDirPath = await realpath(
      await runGit({
        cwd: canonicalWorktreePath,
        args: ["rev-parse", "--absolute-git-dir"],
      }),
    );
    const canonicalGitCommonDirPath = await realpath(
      await runGit({
        cwd: canonicalWorktreePath,
        args: ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      }),
    );
    const branch = await runGit({
      cwd: canonicalWorktreePath,
      args: ["symbolic-ref", "--short", "HEAD"],
    });
    const head = (
      await runGit({
        cwd: canonicalWorktreePath,
        args: ["rev-parse", "--verify", "HEAD^{commit}"],
      })
    ).toLowerCase();
    const expectedPath = await realpath(input.worktreePath);
    const expectedParent = await realpath(dirname(input.worktreePath));
    if (
      canonicalRoot !== expectedPath ||
      canonicalWorktreePath !== expectedPath ||
      !isWithin(canonicalWorktreePath, expectedParent) ||
      canonicalWorktreePath === input.project.canonicalRootPath ||
      canonicalGitCommonDirPath !== input.project.canonicalGitCommonDirPath ||
      branch !== input.managedBranch ||
      head !== input.sourceCommit
    )
      throw new ProjectSessionServiceError("session_recovery_required");
    const worktree = await fileIdentity(canonicalWorktreePath);
    const gitDir = await fileIdentity(canonicalGitDirPath);
    const commonDir = await fileIdentity(canonicalGitCommonDirPath);
    if (!worktree.isDirectory || !gitDir.isDirectory || !commonDir.isDirectory)
      throw new ProjectSessionServiceError("session_recovery_required");
    return {
      canonicalWorktreePath,
      canonicalGitDirPath,
      canonicalGitCommonDirPath,
      worktreeDeviceId: worktree.deviceId,
      worktreeFileId: worktree.fileId,
      gitDirDeviceId: gitDir.deviceId,
      gitDirFileId: gitDir.fileId,
      commonDirDeviceId: commonDir.deviceId,
      commonDirFileId: commonDir.fileId,
    };
  } catch (error) {
    if (error instanceof ProjectSessionServiceError) throw error;
    throw new ProjectSessionServiceError("session_recovery_required");
  }
};

export const cleanupManagedWorktree = async (input: {
  readonly project: AuthenticatedProjectRepository;
  readonly worktreePath: string;
  readonly managedBranch: string;
}): Promise<void> => {
  try {
    await runGit({
      cwd: input.project.canonicalRootPath,
      args: ["worktree", "remove", input.worktreePath],
    });
    await runGit({
      cwd: input.project.canonicalRootPath,
      args: ["branch", "-D", input.managedBranch],
    });
  } catch {
    throw new ProjectSessionServiceError("session_recovery_required");
  }
};
