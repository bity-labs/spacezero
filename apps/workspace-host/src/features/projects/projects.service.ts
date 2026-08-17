import type { RegisterProjectRequest } from "@spacezero/host-contracts";
import {
  inspectGitRepository,
  ProjectInspectionError,
} from "./projects.git.adapter.js";
import {
  createProjectsRepository,
  ProjectRepositoryError,
} from "./projects.repository.js";
import type {
  ProjectCatalog,
  RegisterProjectResult,
  ListProjectsResult,
} from "./project.model.js";

export class ProjectServiceError extends Error {
  constructor(
    readonly code:
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
        return await repository.register(input, inspected);
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
