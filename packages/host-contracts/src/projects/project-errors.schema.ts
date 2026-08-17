import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type ProjectErrorCode =
  | "invalid_project_path"
  | "not_git_repository"
  | "repository_has_no_commit"
  | "repository_identity_mismatch"
  | "command_id_conflict"
  | "project_catalog_unavailable";

export interface ProjectCatalogError {
  readonly code: ProjectErrorCode;
  readonly message: string;
}

const projectError = <Code extends ProjectErrorCode>(
  code: Code,
  status: 409 | 422 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const InvalidProjectPathErrorSchema = projectError(
  "invalid_project_path",
  422,
);
export const NotGitRepositoryErrorSchema = projectError(
  "not_git_repository",
  422,
);
export const RepositoryHasNoCommitErrorSchema = projectError(
  "repository_has_no_commit",
  422,
);
export const RepositoryIdentityMismatchErrorSchema = projectError(
  "repository_identity_mismatch",
  409,
);
export const CommandIdConflictErrorSchema = projectError(
  "command_id_conflict",
  409,
);
export const ProjectCatalogUnavailableErrorSchema = projectError(
  "project_catalog_unavailable",
  503,
);

export const ProjectCatalogErrorSchemas = [
  InvalidProjectPathErrorSchema,
  NotGitRepositoryErrorSchema,
  RepositoryHasNoCommitErrorSchema,
  RepositoryIdentityMismatchErrorSchema,
  CommandIdConflictErrorSchema,
  ProjectCatalogUnavailableErrorSchema,
] as const;

export const projectErrorBody = (
  code: ProjectErrorCode,
): ProjectCatalogError => {
  switch (code) {
    case "invalid_project_path":
      return { code, message: "Choose an existing repository folder." };
    case "not_git_repository":
      return { code, message: "Choose a Git repository." };
    case "repository_has_no_commit":
      return {
        code,
        message: "Choose a Git repository with at least one commit.",
      };
    case "repository_identity_mismatch":
      return {
        code,
        message:
          "The repository at this location no longer matches the registered Project.",
      };
    case "command_id_conflict":
      return {
        code,
        message:
          "This registration command ID was already used for different input.",
      };
    case "project_catalog_unavailable":
      return {
        code,
        message: "The Project catalog is temporarily unavailable.",
      };
  }
};
