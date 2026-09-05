import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type AgentRuntimeErrorCode =
  | "model_not_found"
  | "model_unavailable"
  | "thinking_level_unsupported"
  | "default_model_required"
  | "agent_runtime_unavailable";

export interface AgentRuntimeError {
  readonly code: AgentRuntimeErrorCode;
  readonly message: string;
}

const agentRuntimeError = <Code extends AgentRuntimeErrorCode>(
  code: Code,
  status: 422 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const ModelNotFoundErrorSchema = agentRuntimeError(
  "model_not_found",
  422,
);
export const ModelUnavailableErrorSchema = agentRuntimeError(
  "model_unavailable",
  422,
);
export const ThinkingLevelUnsupportedErrorSchema = agentRuntimeError(
  "thinking_level_unsupported",
  422,
);
export const DefaultModelRequiredErrorSchema = agentRuntimeError(
  "default_model_required",
  422,
);
export const AgentRuntimeUnavailableErrorSchema = agentRuntimeError(
  "agent_runtime_unavailable",
  503,
);

export const AgentRuntimeErrorSchemas = [
  ModelNotFoundErrorSchema,
  ModelUnavailableErrorSchema,
  ThinkingLevelUnsupportedErrorSchema,
  DefaultModelRequiredErrorSchema,
  AgentRuntimeUnavailableErrorSchema,
] as const;

export const agentRuntimeErrorBody = (
  code: AgentRuntimeErrorCode,
): AgentRuntimeError => {
  switch (code) {
    case "model_not_found":
      return { code, message: "The selected model does not exist." };
    case "model_unavailable":
      return {
        code,
        message: "The selected model is not currently available.",
      };
    case "thinking_level_unsupported":
      return {
        code,
        message: "The selected thinking level is not supported by the model.",
      };
    case "default_model_required":
      return {
        code,
        message: "Choose a default model before choosing a thinking level.",
      };
    case "agent_runtime_unavailable":
      return {
        code,
        message: "Agent runtime defaults are temporarily unavailable.",
      };
  }
};
