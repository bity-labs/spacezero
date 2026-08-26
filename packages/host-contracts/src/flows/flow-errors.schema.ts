import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type FlowErrorCode =
  | "flow_not_found"
  | "flow_prompt_not_pending"
  | "invalid_flow_response"
  | "flow_unavailable";

export interface FlowError {
  readonly code: FlowErrorCode;
  readonly message: string;
}

const flowError = <Code extends FlowErrorCode>(
  code: Code,
  status: 404 | 409 | 422 | 503,
) =>
  Schema.Struct({
    code: Schema.Literals([code]),
    message: Schema.String,
  }).pipe(HttpApiSchema.status(status));

export const FlowNotFoundErrorSchema = flowError("flow_not_found", 404);
export const FlowPromptNotPendingErrorSchema = flowError(
  "flow_prompt_not_pending",
  409,
);
export const InvalidFlowResponseErrorSchema = flowError(
  "invalid_flow_response",
  422,
);
export const FlowUnavailableErrorSchema = flowError("flow_unavailable", 503);

export const FlowErrorSchemas = [
  FlowNotFoundErrorSchema,
  FlowPromptNotPendingErrorSchema,
  InvalidFlowResponseErrorSchema,
  FlowUnavailableErrorSchema,
] as const;

export const flowErrorBody = (code: FlowErrorCode): FlowError => {
  switch (code) {
    case "flow_not_found":
      return { code, message: "This flow is no longer available." };
    case "flow_prompt_not_pending":
      return { code, message: "This flow is not waiting for that response." };
    case "invalid_flow_response":
      return { code, message: "Enter a valid flow response." };
    case "flow_unavailable":
      return { code, message: "Flow handling is temporarily unavailable." };
  }
};
