import type { RegisterProjectRequest } from "@spacezero/host-contracts";
import { runGit } from "../../runtime/git-process.adapter.js";
import {
  inspectGitRepository,
  isCommitReachableFromHead,
  ProjectInspectionError,
} from "./projects.git.adapter.js";
import {
  createProjectsRepository,
  ProjectRepositoryError,
} from "./projects.repository.js";
import type {
  AuthenticatedProjectRepository,
  ProjectCatalog,
  RegisterProjectResult,
  ListProjectsResult,
} from "./project.model.js";

export class ProjectServiceError extends Error {
  constructor(
    readonly code:
      | "project_not_found"
      | "invalid_project_path"
      | "not_git_repository"
      | "repository_has_no_commit"
      | "repository_identity_mismatch"
      | "command_id_conflict"
      | "project_catalog_unavailable",
  ) {
    super(code);
  }
}

const mapError = (error: unknown): ProjectServiceError => {
  if (error instanceof ProjectInspectionError)
    return new ProjectServiceError(error.code);
  if (error instanceof ProjectRepositoryError)
    return new ProjectServiceError(error.code);
  return new ProjectServiceError("project_catalog_unavailable");
};

const sourceBranch = async (cwd: string): Promise<string | null> => {
  try {
    return await runGit({ cwd, args: ["symbolic-ref", "--short", "HEAD"] });
  } catch {
    return null;
  }
};
const assertRegisteredCommitReachable = async (
  cwd: string,
  registeredHeadCommit: string,
): Promise<void> => {
  if (!(await isCommitReachableFromHead(cwd, registeredHeadCommit)))
    throw new ProjectRepositoryError("repository_identity_mismatch");
};

const isDirty = async (cwd: string): Promise<boolean> => {
  try {
    return (
      (await runGit({ cwd, args: ["status", "--porcelain=v1"] })).length > 0
    );
  } catch {
    return false;
  }
};

export const createProjectCatalog = (databasePath: string): ProjectCatalog => {
  const repository = createProjectsRepository(databasePath);
  return {
    register: async (
      input: RegisterProjectRequest,
      signal?: AbortSignal,
    ): Promise<RegisterProjectResult> => {
      try {
        const replay = await repository.replayRegistration(input);
        if (replay) return replay;
        const inspected = await inspectGitRepository(input.path, signal);
        return await repository.register(input, inspected, (existing) =>
          assertRegisteredCommitReachable(
            inspected.canonicalRootPath,
            existing.registered_head_commit,
          ),
        );
      } catch (error) {
        throw mapError(error);
      }
    },
    list: async (): Promise<ListProjectsResult> => {
      try {
        return await repository.list();
      } catch (error) {
        throw mapError(error);
      }
    },
  };
};

export const createProjectAuthority = (databasePath: string) => {
  const repository = createProjectsRepository(databasePath);
  return {
    authenticateProject: async (
      projectId: string,
    ): Promise<AuthenticatedProjectRepository> => {
      try {
        const row = await repository.getProjectRegistration(projectId);
        if (!row) throw new ProjectServiceError("project_not_found");
        const inspected = await inspectGitRepository(row.canonical_root_path);
        if (
          row.canonical_root_path !== inspected.canonicalRootPath ||
          row.canonical_git_dir_path !== inspected.canonicalGitDirPath ||
          row.canonical_git_common_dir_path !==
            inspected.canonicalGitCommonDirPath ||
          row.root_device_id !== inspected.rootDeviceId ||
          row.root_file_id !== inspected.rootFileId ||
          row.common_dir_device_id !== inspected.commonDirDeviceId ||
          row.common_dir_file_id !== inspected.commonDirFileId ||
          row.objects_dir_device_id !== inspected.objectsDirDeviceId ||
          row.objects_dir_file_id !== inspected.objectsDirFileId
        )
          throw new ProjectServiceError("repository_identity_mismatch");
        await assertRegisteredCommitReachable(
          inspected.canonicalRootPath,
          row.registered_head_commit,
        );
        const branch = await sourceBranch(inspected.canonicalRootPath);
        return {
          ...inspected,
          projectId,
          registeredHeadCommit: row.registered_head_commit,
          sourceBranch: branch,
          sourceDetached: branch === null,
          dirty: await isDirty(inspected.canonicalRootPath),
        };
      } catch (error) {
        if (error instanceof ProjectServiceError) throw error;
        throw mapError(error);
      }
    },
  };
};
