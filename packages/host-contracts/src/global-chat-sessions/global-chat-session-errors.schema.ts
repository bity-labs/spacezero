import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type GlobalChatSessionErrorCode =
  | "command_id_conflict"
  | "global_chat_session_unavailable"
  | "global_chat_session_not_found"
  | "global_chat_session_archived"
  | "global_chat_session_title_invalid"
  | "global_chat_session_turn_in_progress"
  | "global_chat_session_runtime_revision_conflict"
  | "global_chat_session_recovery_required"
  | "follow_up_not_found"
  | "follow_up_not_cancellable"
  | "follow_up_queue_unavailable"
  | "turn_not_found"
  | "turn_not_active"
  | "agent_configuration_invalid"
  | "agent_authentication_required"
  | "agent_default_model_missing"
  | "agent_turn_failed"
  | "agent_unavailable";

export interface GlobalChatSessionError {
  readonly code: GlobalChatSessionErrorCode;
  readonly message: string;
}

const globalChatSessionError = <Code extends GlobalChatSessionErrorCode>(
  code: Code,
  status: 400 | 404 | 409 | 502 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const GlobalChatSessionCommandIdConflictErrorSchema =
  globalChatSessionError("command_id_conflict", 409);
export const GlobalChatSessionUnavailableErrorSchema = globalChatSessionError(
  "global_chat_session_unavailable",
  503,
);
export const GlobalChatSessionNotFoundErrorSchema = globalChatSessionError(
  "global_chat_session_not_found",
  404,
);
export const GlobalChatSessionArchivedErrorSchema = globalChatSessionError(
  "global_chat_session_archived",
  409,
);
export const GlobalChatSessionTitleInvalidErrorSchema = globalChatSessionError(
  "global_chat_session_title_invalid",
  400,
);
export const GlobalChatSessionTurnInProgressErrorSchema =
  globalChatSessionError("global_chat_session_turn_in_progress", 409);
export const GlobalChatSessionRuntimeRevisionConflictErrorSchema =
  globalChatSessionError("global_chat_session_runtime_revision_conflict", 409);
export const GlobalChatSessionRecoveryRequiredErrorSchema =
  globalChatSessionError("global_chat_session_recovery_required", 409);
export const GlobalChatSessionFollowUpNotFoundErrorSchema =
  globalChatSessionError("follow_up_not_found", 404);
export const GlobalChatSessionFollowUpNotCancellableErrorSchema =
  globalChatSessionError("follow_up_not_cancellable", 409);
export const GlobalChatSessionFollowUpQueueUnavailableErrorSchema =
  globalChatSessionError("follow_up_queue_unavailable", 503);
export const GlobalChatSessionTurnNotFoundErrorSchema = globalChatSessionError(
  "turn_not_found",
  404,
);
export const GlobalChatSessionTurnNotActiveErrorSchema = globalChatSessionError(
  "turn_not_active",
  409,
);
export const GlobalChatSessionAgentConfigurationInvalidErrorSchema =
  globalChatSessionError("agent_configuration_invalid", 409);
export const GlobalChatSessionAgentAuthenticationRequiredErrorSchema =
  globalChatSessionError("agent_authentication_required", 409);
export const GlobalChatSessionAgentDefaultModelMissingErrorSchema =
  globalChatSessionError("agent_default_model_missing", 409);
export const GlobalChatSessionAgentTurnFailedErrorSchema =
  globalChatSessionError("agent_turn_failed", 502);
export const GlobalChatSessionAgentUnavailableErrorSchema =
  globalChatSessionError("agent_unavailable", 503);

export const GlobalChatSessionErrorSchemas = [
  GlobalChatSessionCommandIdConflictErrorSchema,
  GlobalChatSessionUnavailableErrorSchema,
  GlobalChatSessionNotFoundErrorSchema,
  GlobalChatSessionArchivedErrorSchema,
  GlobalChatSessionTitleInvalidErrorSchema,
  GlobalChatSessionTurnInProgressErrorSchema,
  GlobalChatSessionRuntimeRevisionConflictErrorSchema,
  GlobalChatSessionRecoveryRequiredErrorSchema,
  GlobalChatSessionFollowUpNotFoundErrorSchema,
  GlobalChatSessionFollowUpNotCancellableErrorSchema,
  GlobalChatSessionFollowUpQueueUnavailableErrorSchema,
  GlobalChatSessionTurnNotFoundErrorSchema,
  GlobalChatSessionTurnNotActiveErrorSchema,
  GlobalChatSessionAgentConfigurationInvalidErrorSchema,
  GlobalChatSessionAgentAuthenticationRequiredErrorSchema,
  GlobalChatSessionAgentDefaultModelMissingErrorSchema,
  GlobalChatSessionAgentTurnFailedErrorSchema,
  GlobalChatSessionAgentUnavailableErrorSchema,
] as const;

export const globalChatSessionErrorBody = (
  code: GlobalChatSessionErrorCode,
): GlobalChatSessionError => {
  switch (code) {
    case "command_id_conflict":
      return {
        code,
        message:
          "This Global Chat Session command ID was already used for different input.",
      };
    case "global_chat_session_unavailable":
      return {
        code,
        message: "Global Chat Sessions are temporarily unavailable.",
      };
    case "global_chat_session_not_found":
      return { code, message: "The selected Global Chat Session does not exist." };
    case "global_chat_session_archived":
      return {
        code,
        message: "Archived Global Chat Sessions must be unarchived before continuing.",
      };
    case "global_chat_session_title_invalid":
      return {
        code,
        message:
          "Chat titles cannot be empty and must be 120 characters or fewer on a single line.",
      };
    case "global_chat_session_turn_in_progress":
      return {
        code,
        message:
          "An agent turn is already in progress for this Global Chat Session.",
      };
    case "global_chat_session_runtime_revision_conflict":
      return {
        code,
        message:
          "This Global Chat Session runtime configuration changed. Reload and try again.",
      };
    case "global_chat_session_recovery_required":
      return {
        code,
        message: "This Global Chat Session needs recovery before it can be used.",
      };
    case "follow_up_not_found":
      return { code, message: "The selected follow-up does not exist." };
    case "follow_up_not_cancellable":
      return {
        code,
        message: "The selected follow-up can no longer be cancelled.",
      };
    case "follow_up_queue_unavailable":
      return {
        code,
        message: "The Global Chat follow-up queue is temporarily unavailable.",
      };
    case "turn_not_found":
      return { code, message: "The selected agent turn does not exist." };
    case "turn_not_active":
      return {
        code,
        message: "The selected agent turn is not currently running.",
      };
    case "agent_configuration_invalid":
      return {
        code,
        message:
          "The selected agent runtime configuration is unavailable or unsupported.",
      };
    case "agent_authentication_required":
      return {
        code,
        message: "The selected agent provider needs authentication.",
      };
    case "agent_default_model_missing":
      return {
        code,
        message:
          "No default agent model is configured. Choose a default model in Settings → Models.",
      };
    case "agent_turn_failed":
      return {
        code,
        message: "The agent turn failed. Try the prompt again.",
      };
    case "agent_unavailable":
      return {
        code,
        message: "The agent is unavailable right now. Try again shortly.",
      };
  }
};
