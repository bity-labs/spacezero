import { Schema } from "effect";

export type GlobalChatSessionId = string;
export type GlobalChatSessionCommandId = string;
export type GlobalChatSessionMessageId = string;
export type GlobalChatSessionMessageRole = "user" | "assistant";

export interface GlobalChatSessionSummary {
  readonly id: GlobalChatSessionId;
  readonly title: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastSequence: number;
}

export interface GlobalChatSessionMessage {
  readonly id: GlobalChatSessionMessageId;
  readonly role: GlobalChatSessionMessageRole;
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface CreateGlobalChatSessionWithFirstPromptRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly firstPrompt: string;
}

export interface CreateGlobalChatSessionWithFirstPromptResult {
  readonly session: GlobalChatSessionSummary;
  readonly firstMessage: GlobalChatSessionMessage;
}

const DateTimeUtcStringSchema = Schema.String.check(
  Schema.makeFilter((value: string) => {
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString() === value;
  }),
);

export const GlobalChatSessionIdSchema = Schema.String.check(Schema.isUUID());
export const GlobalChatSessionCommandIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const GlobalChatSessionMessageIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const GlobalChatSessionTitleSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(60),
  Schema.makeFilter(
    (value: string) =>
      !/[\r\n]/.test(value) || "title must be a single line",
  ),
);
export const GlobalChatSessionPromptSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16_000),
  Schema.makeFilter(
    (value: string) => value.trim().length > 0 || "prompt must not be blank",
  ),
);
export const GlobalChatSessionMessageTextSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1_000_000),
);
export const GlobalChatSessionMessageRoleSchema = Schema.Literals([
  "user",
  "assistant",
]);

export const GlobalChatSessionSummarySchema = Schema.Struct({
  id: GlobalChatSessionIdSchema,
  title: GlobalChatSessionTitleSchema,
  archived: Schema.Boolean,
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
  lastSequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
});
export const GlobalChatSessionMessageSchema = Schema.Struct({
  id: GlobalChatSessionMessageIdSchema,
  role: GlobalChatSessionMessageRoleSchema,
  text: GlobalChatSessionMessageTextSchema,
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  createdAt: DateTimeUtcStringSchema,
});
export const CreateGlobalChatSessionWithFirstPromptRequestSchema =
  Schema.Struct({
    commandId: GlobalChatSessionCommandIdSchema,
    firstPrompt: GlobalChatSessionPromptSchema,
  });
export const CreateGlobalChatSessionWithFirstPromptResultSchema =
  Schema.Struct({
    session: GlobalChatSessionSummarySchema,
    firstMessage: GlobalChatSessionMessageSchema,
  });

export const GlobalChatSessionEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionCreatedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    title: GlobalChatSessionTitleSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatUserMessageSubmittedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    prompt: GlobalChatSessionMessageTextSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
]);
export type GlobalChatSessionEvent = typeof GlobalChatSessionEventSchema.Type;

export const deriveGlobalChatSessionInitialTitle = (prompt: string): string => {
  const firstLine = (prompt.trim().split(/\r\n|\n|\r/u)[0] ?? "").trim();
  return [...firstLine].slice(0, 60).join("");
};
