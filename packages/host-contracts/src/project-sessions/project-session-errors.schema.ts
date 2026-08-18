import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type ProjectSessionErrorCode =
  | "project_not_found"
  | "project_repository_unavailable"
  | "project_repository_identity_mismatch"
  | "source_revision_unavailable"
  | "command_id_conflict"
  | "session_provisioning_failed"
  | "session_recovery_required"
  | "session_name_unavailable"
  | "project_session_catalog_unavailable";

export interface ProjectSessionError {
  readonly code: ProjectSessionErrorCode;
  readonly message: string;
}

const projectSessionError = <Code extends ProjectSessionErrorCode>(
  code: Code,
  status: 404 | 409 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const ProjectNotFoundErrorSchema = projectSessionError(
  "project_not_found",
  404,
);
export const ProjectRepositoryUnavailableErrorSchema = projectSessionError(
  "project_repository_unavailable",
  409,
);
export const ProjectRepositoryIdentityMismatchErrorSchema = projectSessionError(
  "project_repository_identity_mismatch",
  409,
);
export const SourceRevisionUnavailableErrorSchema = projectSessionError(
  "source_revision_unavailable",
  409,
);
export const ProjectSessionCommandIdConflictErrorSchema = projectSessionError(
  "command_id_conflict",
  409,
);
export const SessionProvisioningFailedErrorSchema = projectSessionError(
  "session_provisioning_failed",
  503,
);
export const SessionRecoveryRequiredErrorSchema = projectSessionError(
  "session_recovery_required",
  409,
);
export const SessionNameUnavailableErrorSchema = projectSessionError(
  "session_name_unavailable",
  503,
);
export const ProjectSessionCatalogUnavailableErrorSchema = projectSessionError(
  "project_session_catalog_unavailable",
  503,
);

export const ProjectSessionErrorSchemas = [
  ProjectNotFoundErrorSchema,
  ProjectRepositoryUnavailableErrorSchema,
  ProjectRepositoryIdentityMismatchErrorSchema,
  SourceRevisionUnavailableErrorSchema,
  ProjectSessionCommandIdConflictErrorSchema,
  SessionProvisioningFailedErrorSchema,
  SessionRecoveryRequiredErrorSchema,
  SessionNameUnavailableErrorSchema,
  ProjectSessionCatalogUnavailableErrorSchema,
] as const;

export const projectSessionErrorBody = (
  code: ProjectSessionErrorCode,
): ProjectSessionError => {
  switch (code) {
    case "project_not_found":
      return { code, message: "The selected Project does not exist." };
    case "project_repository_unavailable":
      return {
        code,
        message:
          "The Project repository is unavailable. Check the folder and try again.",
      };
    case "project_repository_identity_mismatch":
      return {
        code,
        message:
          "The Project repository identity no longer matches its registration.",
      };
    case "source_revision_unavailable":
      return {
        code,
        message: "The Project does not have a valid committed source revision.",
      };
    case "command_id_conflict":
      return {
        code,
        message:
          "This Session command ID was already used for different input.",
      };
    case "session_provisioning_failed":
      return {
        code,
        message: "The Session worktree could not be prepared.",
      };
    case "session_recovery_required":
      return {
        code,
        message: "This Session needs recovery before it can be used.",
      };
    case "session_name_unavailable":
      return {
        code,
        message: "A unique Session name could not be reserved.",
      };
    case "project_session_catalog_unavailable":
      return {
        code,
        message: "The Project Session catalog is temporarily unavailable.",
      };
  }
};
