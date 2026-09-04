import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export type GlobalChatSessionErrorCode =
  | "command_id_conflict"
  | "global_chat_session_unavailable";

export interface GlobalChatSessionError {
  readonly code: GlobalChatSessionErrorCode;
  readonly message: string;
}

const globalChatSessionError = <Code extends GlobalChatSessionErrorCode>(
  code: Code,
  status: 409 | 503,
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

export const GlobalChatSessionErrorSchemas = [
  GlobalChatSessionCommandIdConflictErrorSchema,
  GlobalChatSessionUnavailableErrorSchema,
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
  }
};
