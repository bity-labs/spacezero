import { Schema, SchemaGetter } from "effect";
import {
  AgentThinkingLevelSchema,
  type AgentThinkingLevel,
} from "../agent-runtime/agent-runtime.schema.js";

export type GlobalChatSessionId = string;
export type GlobalChatSessionCommandId = string;
export type GlobalChatSessionFollowUpId = string;
export type GlobalChatSessionMessageId = string;
export type GlobalChatSessionMessageRole = "user" | "assistant";
export type GlobalChatSessionTurnId = string;
export type GlobalChatSessionToolCallId = string;
export type GlobalChatSessionTurnState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "recovery_required";
export type GlobalChatSessionFollowUpState =
  "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
export type GlobalChatSessionAgentToolApprovalStatus =
  "approved" | "requires_approval";
export type GlobalChatSessionAgentToolSafety = "read" | "write" | "dangerous";
export type GlobalChatSessionTurnFailureCategory =
  | "configuration"
  | "authentication"
  | "provider"
  | "tool"
  | "interrupted"
  | "system";

export interface GlobalChatSessionSummary {
  readonly id: GlobalChatSessionId;
  readonly title: string;
  readonly archived: boolean;
  /** Durable archive time; present only while the session is archived. */
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastSequence: number;
}

/**
 * A Global Chat Session summary batched with a sanitized last-message
 * preview: the first non-empty line of the most recent user or assistant
 * message text (text parts fallback), computed Host-side so list consumers
 * never fetch per-session message pages. It is a plain browser-safe string:
 * no full transcripts, reasoning, tool calls, or tool results.
 */
export interface GlobalChatSessionSummaryWithPreview {
  readonly lastMessagePreview?: string;
}

export interface GlobalChatSessionSummary
  extends GlobalChatSessionSummaryWithPreview {
  readonly id: GlobalChatSessionId;
  readonly title: string;
  readonly archived: boolean;
  /** Durable archive time; present only while the session is archived. */
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastSequence: number;
}

export interface GlobalChatSessionTextPart {
  readonly id: string;
  readonly type: "text";
  readonly order: number;
  readonly text: string;
  readonly turnId?: GlobalChatSessionTurnId;
}

export interface GlobalChatSessionReasoningPart {
  readonly id: string;
  readonly type: "reasoning";
  readonly order: number;
  readonly text: string;
  readonly turnId?: GlobalChatSessionTurnId;
}

export type GlobalChatSessionAgentToolJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly GlobalChatSessionAgentToolJsonValue[]
  | { readonly [key: string]: GlobalChatSessionAgentToolJsonValue };

export interface GlobalChatSessionAgentToolJsonObject {
  readonly [key: string]: GlobalChatSessionAgentToolJsonValue;
}

export type GlobalChatSessionAgentToolImageMimeType =
  "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type GlobalChatSessionAgentToolDisplayContent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly data: string;
      readonly mimeType: GlobalChatSessionAgentToolImageMimeType;
    }
  | {
      readonly type: "unsupported";
      readonly label: string;
    };

export interface GlobalChatSessionAgentToolDisplayResult {
  readonly content: readonly GlobalChatSessionAgentToolDisplayContent[];
  readonly truncated?: boolean;
}

export interface GlobalChatSessionToolCallPart {
  readonly id: string;
  readonly type: "tool-call";
  readonly order: number;
  readonly turnId?: GlobalChatSessionTurnId;
  readonly toolCallId: GlobalChatSessionToolCallId;
  readonly toolName: string;
  readonly status: "running" | "succeeded" | "failed";
  readonly arguments?: GlobalChatSessionAgentToolJsonObject;
  readonly progress?: string;
  readonly result?: GlobalChatSessionAgentToolDisplayResult;
  readonly safety?: GlobalChatSessionAgentToolSafety;
  readonly approvalStatus?: GlobalChatSessionAgentToolApprovalStatus;
  readonly approvalReason?: string;
}

export type GlobalChatSessionMessagePart =
  | GlobalChatSessionTextPart
  | GlobalChatSessionReasoningPart
  | GlobalChatSessionToolCallPart;

export interface GlobalChatSessionMessage {
  readonly id: GlobalChatSessionMessageId;
  readonly role: GlobalChatSessionMessageRole;
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly commandId?: GlobalChatSessionCommandId;
  readonly turnId?: GlobalChatSessionTurnId;
  readonly parts?: readonly GlobalChatSessionMessagePart[];
}

export interface GlobalChatSessionDraftMessage {
  readonly id: GlobalChatSessionMessageId;
  readonly text: string;
  readonly parts: readonly GlobalChatSessionMessagePart[];
}

export interface GlobalChatSessionTurn {
  readonly id: GlobalChatSessionTurnId;
  readonly commandId: GlobalChatSessionCommandId;
  readonly state: GlobalChatSessionTurnState;
  readonly userMessageId: GlobalChatSessionMessageId;
  readonly assistantMessageId: GlobalChatSessionMessageId;
  readonly assistantMessageIds: readonly GlobalChatSessionMessageId[];
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly draftText: string;
  readonly draftParts?: readonly GlobalChatSessionMessagePart[];
  readonly draftMessages?: readonly GlobalChatSessionDraftMessage[];
  readonly failureReason?: string;
  readonly failureCategory?: GlobalChatSessionTurnFailureCategory;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GlobalChatSessionRuntimeConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly defaultThinkingLevel: AgentThinkingLevel;
  readonly revision: number;
}

export interface CreateGlobalChatSessionWithFirstPromptRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly firstPrompt: string;
}

export interface CreateGlobalChatSessionWithFirstPromptResult {
  readonly session: GlobalChatSessionSummary;
  readonly turn: GlobalChatSessionTurn;
  readonly userMessage: GlobalChatSessionMessage;
  /** Compatibility alias for the #517 prototype response. */
  readonly firstMessage: GlobalChatSessionMessage;
}

export interface ListGlobalChatSessionsResult {
  readonly sessions: readonly GlobalChatSessionSummary[];
  /** Continuation state; present only when the caller requested paging. */
  readonly pageInfo?: GlobalChatSessionListPageInfo;
}

/**
 * Paged Global Chat Session list query. Offset paging with a fixed default
 * page size of 20 (`GLOBAL_CHAT_SESSIONS_PAGE_SIZE`): each page is one
 * batched Host query that also computes every session's last-message
 * preview. `archived` selects the tab semantics — `false` (or omitted)
 * orders unarchived sessions by last updated descending, `true` orders
 * archived sessions by archived time descending. Omitting `limit` returns
 * the legacy unpaginated full list.
 */
export interface ListGlobalChatSessionsPageQuery {
  readonly archived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

/** Continuation state for a page of Global Chat Session summaries. */
export interface GlobalChatSessionListPageInfo {
  /** Number of sessions in this page. */
  readonly pageSize: number;
  readonly hasMore: boolean;
  /** Offset to pass to the next page; present only while `hasMore`. */
  readonly nextOffset?: number;
}

/** Required All Chats page size (PRD #516 acceptance, issue #586). */
export const GLOBAL_CHAT_SESSIONS_PAGE_SIZE = 20;
/** Upper bound for one Global Chat Session list page request. */
export const GLOBAL_CHAT_SESSIONS_MAX_PAGE_SIZE = 100;

export interface SubmitGlobalChatSessionPromptRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly prompt: string;
}

export interface EnqueueGlobalChatSessionFollowUpRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly prompt: string;
}

export interface GlobalChatSessionFollowUp {
  readonly id: GlobalChatSessionFollowUpId;
  readonly commandId: GlobalChatSessionCommandId;
  readonly sessionId: GlobalChatSessionId;
  readonly prompt: string;
  readonly state: GlobalChatSessionFollowUpState;
  readonly position: number;
  readonly dispatchedTurnId?: GlobalChatSessionTurnId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EnqueueGlobalChatSessionFollowUpResult {
  readonly session: GlobalChatSessionSummary;
  readonly followUp: GlobalChatSessionFollowUp;
}

export interface ListGlobalChatSessionFollowUpsResult {
  readonly session: GlobalChatSessionSummary;
  readonly followUps: readonly GlobalChatSessionFollowUp[];
}

export interface CancelGlobalChatSessionFollowUpResult {
  readonly session: GlobalChatSessionSummary;
  readonly followUp: GlobalChatSessionFollowUp;
}

export interface SubmitGlobalChatSessionPromptResult {
  readonly session: GlobalChatSessionSummary;
  readonly turn: GlobalChatSessionTurn;
  readonly userMessage: GlobalChatSessionMessage;
}

export interface GlobalChatSessionMessageHistoryPageInfo {
  readonly pageSize: number;
  readonly hasMoreOlder: boolean;
  readonly oldestSequence?: number;
  readonly newestSequence?: number;
}

export interface ListGlobalChatSessionMessagesQuery {
  readonly beforeSequence?: number;
  readonly limit?: number;
}

export interface ListGlobalChatSessionMessagesResult {
  readonly session: GlobalChatSessionSummary;
  readonly messages: readonly GlobalChatSessionMessage[];
  readonly activeTurn?: GlobalChatSessionTurn;
  readonly latestTurn?: GlobalChatSessionTurn;
  readonly pageInfo?: GlobalChatSessionMessageHistoryPageInfo;
}

export interface GetGlobalChatSessionRuntimeResult {
  readonly session: GlobalChatSessionSummary;
  readonly runtime: GlobalChatSessionRuntimeConfiguration;
}

export interface UpdateGlobalChatSessionRuntimeRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly providerId: string;
  readonly modelId: string;
  readonly defaultThinkingLevel: AgentThinkingLevel;
  readonly expectedRevision: number;
}

export interface UpdateGlobalChatSessionRuntimeResult {
  readonly session: GlobalChatSessionSummary;
  readonly runtime: GlobalChatSessionRuntimeConfiguration;
}

export interface ArchiveGlobalChatSessionRequest {
  readonly commandId: GlobalChatSessionCommandId;
}

export interface ArchiveGlobalChatSessionResult {
  readonly session: GlobalChatSessionSummary;
}

export interface UnarchiveGlobalChatSessionRequest {
  readonly commandId: GlobalChatSessionCommandId;
}

export interface UnarchiveGlobalChatSessionResult {
  readonly session: GlobalChatSessionSummary;
}

export interface RenameGlobalChatSessionRequest {
  readonly commandId: GlobalChatSessionCommandId;
  readonly title: string;
}

export interface RenameGlobalChatSessionResult {
  readonly session: GlobalChatSessionSummary;
}

/**
 * Maximum Global Chat Session title length, measured in Unicode code points
 * (not UTF-16 units), so astral-plane characters such as emoji count as one
 * character. Renamed titles may use the full budget; the initial title
 * derived from the first prompt stays truncated to 60 code points.
 */
export const GLOBAL_CHAT_SESSION_TITLE_MAX_CODE_POINTS = 120;
/**
 * Maximum initial title length derived from the first prompt, in code
 * points (PRD #516 rule; unchanged by the 120-code-point rename budget).
 */
export const GLOBAL_CHAT_SESSION_INITIAL_TITLE_MAX_CODE_POINTS = 60;

/**
 * Counts string length in Unicode code points, unlike
 * `String.prototype.length`, which counts UTF-16 code units. All Global Chat
 * Session title length checks must use this so a stored title always parses
 * and encodes across the wire.
 */
export const globalChatSessionCodePointLength = (value: string): number =>
  [...value].length;

/**
 * Rename validation problems. Titles are trimmed before persistence; the
 * rules mirror GlobalChatSessionTitleSchema so a stored title always parses.
 */
export type GlobalChatSessionTitleProblem =
  | "blank"
  | "too_long"
  | "multi_line";

/**
 * Validates a rename title without silently re-truncating it. Returns the
 * first problem with the trimmed value, or undefined when the title is
 * acceptable as-is.
 */
export const globalChatSessionTitleProblem = (
  title: string,
): { readonly problem: GlobalChatSessionTitleProblem; readonly trimmed: string } | undefined => {
  const trimmed = title.trim();
  if (trimmed.length === 0) return { problem: "blank", trimmed };
  if (/[\r\n]/u.test(title)) return { problem: "multi_line", trimmed };
  if (
    globalChatSessionCodePointLength(trimmed) >
    GLOBAL_CHAT_SESSION_TITLE_MAX_CODE_POINTS
  )
    return { problem: "too_long", trimmed };
  return undefined;
};

export interface InterruptGlobalChatSessionTurnRequest {
  readonly commandId: GlobalChatSessionCommandId;
}

export interface InterruptGlobalChatSessionTurnResult {
  readonly session: GlobalChatSessionSummary;
  readonly turn: GlobalChatSessionTurn;
}

export interface GlobalChatSessionEventStreamQuery {
  readonly after: number;
}

export interface GlobalChatSessionEventEnvelope {
  readonly sequence: number;
  readonly eventType: string;
  readonly event: GlobalChatSessionEvent;
}

export interface GlobalChatSessionLiveEventEnvelope {
  readonly live: true;
  readonly eventType: string;
  readonly event: GlobalChatSessionLiveEvent;
}

export type GlobalChatSessionSseEnvelope =
  GlobalChatSessionEventEnvelope | GlobalChatSessionLiveEventEnvelope;

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
export const GlobalChatSessionFollowUpIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const GlobalChatSessionMessageIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const GlobalChatSessionTurnIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const GlobalChatSessionToolCallIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256),
);
export const GlobalChatSessionTitleSchema = Schema.String.check(
  Schema.isMinLength(1),
  // Code-point semantics: `isMaxLength` counts UTF-16 units, so a title of
  // 120 astral code points would be rejected (and a stored title could fail
  // wire encoding on read-back). Count code points explicitly instead.
  Schema.makeFilter(
    (value: string) =>
      globalChatSessionCodePointLength(value) <=
        GLOBAL_CHAT_SESSION_TITLE_MAX_CODE_POINTS ||
      `title must be at most ${GLOBAL_CHAT_SESSION_TITLE_MAX_CODE_POINTS} code points`,
  ),
  Schema.makeFilter(
    (value: string) => !/[\r\n]/.test(value) || "title must be a single line",
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
);
export const CompletedGlobalChatSessionMessageTextSchema = Schema.String;
export const GlobalChatSessionMessageDraftTextSchema = Schema.String;
export const GlobalChatSessionMessageRoleSchema = Schema.Literals([
  "user",
  "assistant",
]);
export const GlobalChatSessionTurnStateSchema = Schema.Literals([
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
  "recovery_required",
]);
export const GlobalChatSessionFollowUpStateSchema = Schema.Literals([
  "queued",
  "dispatched",
  "consumed",
  "cancelled",
  "recovery_required",
]);
export const GlobalChatSessionAgentToolSafetySchema = Schema.Literals([
  "read",
  "write",
  "dangerous",
]);
export const GlobalChatSessionAgentToolApprovalStatusSchema = Schema.Literals([
  "approved",
  "requires_approval",
]);
export const GlobalChatSessionTurnFailureCategorySchema = Schema.Literals([
  "configuration",
  "authentication",
  "provider",
  "tool",
  "interrupted",
  "system",
]);

export const GlobalChatSessionSummarySchema = Schema.Struct({
  id: GlobalChatSessionIdSchema,
  title: GlobalChatSessionTitleSchema,
  archived: Schema.Boolean,
  archivedAt: Schema.optionalKey(DateTimeUtcStringSchema),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
  lastSequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  lastMessagePreview: Schema.optionalKey(Schema.String),
});
export const GlobalChatSessionTextPartSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  type: Schema.Literals(["text"]),
  order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  text: Schema.String,
  turnId: Schema.optionalKey(GlobalChatSessionTurnIdSchema),
});
export const GlobalChatSessionReasoningPartSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  type: Schema.Literals(["reasoning"]),
  order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  text: Schema.String.check(Schema.isMinLength(1)),
  turnId: Schema.optionalKey(GlobalChatSessionTurnIdSchema),
});
const GlobalChatSessionAgentToolJsonObjectSchema = Schema.Record(
  Schema.String,
  Schema.Json,
);
const GlobalChatSessionAgentToolImageMimeTypeSchema = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const GlobalChatSessionAgentToolImageDataSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
  ),
);
const GlobalChatSessionAgentToolDisplayContentSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["text"]),
    text: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literals(["image"]),
    data: GlobalChatSessionAgentToolImageDataSchema,
    mimeType: GlobalChatSessionAgentToolImageMimeTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["unsupported"]),
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  }),
]);
const GlobalChatSessionAgentToolDisplayResultSchema = Schema.Struct({
  content: Schema.Array(GlobalChatSessionAgentToolDisplayContentSchema),
  truncated: Schema.optionalKey(Schema.Boolean),
});
export const GlobalChatSessionToolCallPartSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  type: Schema.Literals(["tool-call"]),
  order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  turnId: Schema.optionalKey(GlobalChatSessionTurnIdSchema),
  toolCallId: GlobalChatSessionToolCallIdSchema,
  toolName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  status: Schema.Literals(["running", "succeeded", "failed"]),
  arguments: Schema.optionalKey(GlobalChatSessionAgentToolJsonObjectSchema),
  progress: Schema.optionalKey(Schema.String),
  result: Schema.optionalKey(GlobalChatSessionAgentToolDisplayResultSchema),
  safety: Schema.optionalKey(GlobalChatSessionAgentToolSafetySchema),
  approvalStatus: Schema.optionalKey(
    GlobalChatSessionAgentToolApprovalStatusSchema,
  ),
  approvalReason: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(128)),
  ),
});
export const GlobalChatSessionMessagePartSchema = Schema.Union([
  GlobalChatSessionTextPartSchema,
  GlobalChatSessionReasoningPartSchema,
  GlobalChatSessionToolCallPartSchema,
]);
export const GlobalChatSessionMessageSchema = Schema.Struct({
  id: GlobalChatSessionMessageIdSchema,
  role: GlobalChatSessionMessageRoleSchema,
  text: CompletedGlobalChatSessionMessageTextSchema,
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  createdAt: DateTimeUtcStringSchema,
  commandId: Schema.optionalKey(GlobalChatSessionCommandIdSchema),
  turnId: Schema.optionalKey(GlobalChatSessionTurnIdSchema),
  parts: Schema.optionalKey(Schema.Array(GlobalChatSessionMessagePartSchema)),
});
export const GlobalChatSessionDraftMessageSchema = Schema.Struct({
  id: GlobalChatSessionMessageIdSchema,
  text: GlobalChatSessionMessageDraftTextSchema,
  parts: Schema.Array(GlobalChatSessionMessagePartSchema),
});
export const GlobalChatSessionTurnSchema = Schema.Struct({
  id: GlobalChatSessionTurnIdSchema,
  commandId: GlobalChatSessionCommandIdSchema,
  state: GlobalChatSessionTurnStateSchema,
  userMessageId: GlobalChatSessionMessageIdSchema,
  assistantMessageId: GlobalChatSessionMessageIdSchema,
  assistantMessageIds: Schema.Array(GlobalChatSessionMessageIdSchema),
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  thinkingLevel: AgentThinkingLevelSchema,
  draftText: Schema.String,
  draftParts: Schema.optionalKey(
    Schema.Array(GlobalChatSessionMessagePartSchema),
  ),
  draftMessages: Schema.optionalKey(
    Schema.Array(GlobalChatSessionDraftMessageSchema),
  ),
  failureReason: Schema.optionalKey(Schema.String),
  failureCategory: Schema.optionalKey(
    GlobalChatSessionTurnFailureCategorySchema,
  ),
  retryable: Schema.optionalKey(Schema.Boolean),
  retryAfterMs: Schema.optionalKey(Schema.Number),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
});
export const GlobalChatSessionRuntimeConfigurationSchema = Schema.Struct({
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  defaultThinkingLevel: AgentThinkingLevelSchema,
  revision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
});
export const CreateGlobalChatSessionWithFirstPromptRequestSchema =
  Schema.Struct({
    commandId: GlobalChatSessionCommandIdSchema,
    firstPrompt: GlobalChatSessionPromptSchema,
  });
export const CreateGlobalChatSessionWithFirstPromptResultSchema = Schema.Struct(
  {
    session: GlobalChatSessionSummarySchema,
    turn: GlobalChatSessionTurnSchema,
    userMessage: GlobalChatSessionMessageSchema,
    firstMessage: GlobalChatSessionMessageSchema,
  },
);
export const ListGlobalChatSessionsResultSchema = Schema.Struct({
  sessions: Schema.Array(GlobalChatSessionSummarySchema),
  pageInfo: Schema.optionalKey(
    Schema.Struct({
      pageSize: Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0),
      ),
      hasMore: Schema.Boolean,
      nextOffset: Schema.optionalKey(
        Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
      ),
    }),
  ),
});
/**
 * Boolean URL query value: the wire encoding is the string `"true"` or
 * `"false"`, decoded to a boolean on the Host and encoded back on the
 * Client.
 */
export const GlobalChatSessionBooleanQueryStringSchema = Schema.Literals([
  "true",
  "false",
]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === "true"),
    encode: SchemaGetter.transform((value) => (value ? "true" : "false")),
  }),
);
export const ListGlobalChatSessionsPageQuerySchema = Schema.Struct({
  archived: Schema.optionalKey(GlobalChatSessionBooleanQueryStringSchema),
  limit: Schema.optionalKey(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(GLOBAL_CHAT_SESSIONS_MAX_PAGE_SIZE),
      ),
    ),
  ),
  offset: Schema.optionalKey(
    Schema.NumberFromString.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
  ),
});
export const SubmitGlobalChatSessionPromptRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
  prompt: GlobalChatSessionPromptSchema,
});
export const EnqueueGlobalChatSessionFollowUpRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
  prompt: GlobalChatSessionPromptSchema,
});
export const GlobalChatSessionFollowUpSchema = Schema.Struct({
  id: GlobalChatSessionFollowUpIdSchema,
  commandId: GlobalChatSessionCommandIdSchema,
  sessionId: GlobalChatSessionIdSchema,
  prompt: GlobalChatSessionPromptSchema,
  state: GlobalChatSessionFollowUpStateSchema,
  position: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  dispatchedTurnId: Schema.optionalKey(GlobalChatSessionTurnIdSchema),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
});
export const EnqueueGlobalChatSessionFollowUpResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  followUp: GlobalChatSessionFollowUpSchema,
});
export const ListGlobalChatSessionFollowUpsResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  followUps: Schema.Array(GlobalChatSessionFollowUpSchema),
});
export const CancelGlobalChatSessionFollowUpResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  followUp: GlobalChatSessionFollowUpSchema,
});
export const SubmitGlobalChatSessionPromptResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  turn: GlobalChatSessionTurnSchema,
  userMessage: GlobalChatSessionMessageSchema,
});
export const GlobalChatSessionMessageHistoryPageInfoSchema = Schema.Struct({
  pageSize: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  hasMoreOlder: Schema.Boolean,
  oldestSequence: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  ),
  newestSequence: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  ),
});
export const ListGlobalChatSessionMessagesQuerySchema = Schema.Struct({
  beforeSequence: Schema.optionalKey(
    Schema.NumberFromString.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    ),
  ),
  limit: Schema.optionalKey(
    Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(200),
      ),
    ),
  ),
});
export const ListGlobalChatSessionMessagesResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  messages: Schema.Array(GlobalChatSessionMessageSchema),
  activeTurn: Schema.optionalKey(GlobalChatSessionTurnSchema),
  latestTurn: Schema.optionalKey(GlobalChatSessionTurnSchema),
  pageInfo: Schema.optionalKey(GlobalChatSessionMessageHistoryPageInfoSchema),
});
export const GetGlobalChatSessionRuntimeResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  runtime: GlobalChatSessionRuntimeConfigurationSchema,
});
export const UpdateGlobalChatSessionRuntimeRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  defaultThinkingLevel: AgentThinkingLevelSchema,
  expectedRevision: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
});
export const UpdateGlobalChatSessionRuntimeResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  runtime: GlobalChatSessionRuntimeConfigurationSchema,
});
export const ArchiveGlobalChatSessionRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
});
export const ArchiveGlobalChatSessionResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
});
export const UnarchiveGlobalChatSessionRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
});
export const UnarchiveGlobalChatSessionResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
});
export const RenameGlobalChatSessionRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
  title: Schema.String,
});
export const RenameGlobalChatSessionResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
});
export const InterruptGlobalChatSessionTurnRequestSchema = Schema.Struct({
  commandId: GlobalChatSessionCommandIdSchema,
});
export const InterruptGlobalChatSessionTurnResultSchema = Schema.Struct({
  session: GlobalChatSessionSummarySchema,
  turn: GlobalChatSessionTurnSchema,
});
export const GlobalChatSessionEventStreamQuerySchema = Schema.Struct({
  after: Schema.NumberFromString.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
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
    type: Schema.Literals(["GlobalChatSessionRuntimeConfiguredV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    providerId: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    modelId: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(256),
    ),
    defaultThinkingLevel: AgentThinkingLevelSchema,
    revision: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionArchivedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionUnarchivedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionRenamedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    title: GlobalChatSessionTitleSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionFollowUpQueuedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    followUpId: GlobalChatSessionFollowUpIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    prompt: GlobalChatSessionMessageTextSchema,
    position: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionFollowUpDispatchedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    followUpId: GlobalChatSessionFollowUpIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionFollowUpConsumedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    followUpId: GlobalChatSessionFollowUpIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionFollowUpCancelledV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    followUpId: GlobalChatSessionFollowUpIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatSessionFollowUpRecoveryRequiredV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    followUpId: GlobalChatSessionFollowUpIdSchema,
    commandId: GlobalChatSessionCommandIdSchema,
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
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentTurnStartedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    providerId: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    modelId: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(256),
    ),
    thinkingLevel: AgentThinkingLevelSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentMessageCheckpointedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    text: GlobalChatSessionMessageDraftTextSchema,
    parts: Schema.Array(GlobalChatSessionMessagePartSchema),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentMessageCompletedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    text: CompletedGlobalChatSessionMessageTextSchema,
    parts: Schema.Array(GlobalChatSessionMessagePartSchema),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentTurnFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    reason: Schema.String,
    failureCategory: GlobalChatSessionTurnFailureCategorySchema,
    retryable: Schema.Boolean,
    retryAfterMs: Schema.optionalKey(Schema.Number),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentTurnInterruptedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    reason: Schema.Literals(["user_interrupted", "host_shutdown"]),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentToolCallStartedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    toolCallId: GlobalChatSessionToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    safety: Schema.optionalKey(GlobalChatSessionAgentToolSafetySchema),
    approvalStatus: Schema.optionalKey(
      GlobalChatSessionAgentToolApprovalStatusSchema,
    ),
    approvalReason: Schema.optionalKey(
      Schema.String.check(Schema.isMaxLength(128)),
    ),
    arguments: Schema.optionalKey(GlobalChatSessionAgentToolJsonObjectSchema),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentToolCallCompletedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    toolCallId: GlobalChatSessionToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    status: Schema.Literals(["succeeded", "failed"]),
    safety: Schema.optionalKey(GlobalChatSessionAgentToolSafetySchema),
    approvalStatus: Schema.optionalKey(
      GlobalChatSessionAgentToolApprovalStatusSchema,
    ),
    approvalReason: Schema.optionalKey(
      Schema.String.check(Schema.isMaxLength(128)),
    ),
    result: Schema.optionalKey(GlobalChatSessionAgentToolDisplayResultSchema),
    timestamp: DateTimeUtcStringSchema,
  }),
]);
export type GlobalChatSessionEvent = typeof GlobalChatSessionEventSchema.Type;

export const GlobalChatSessionLiveEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAssistantTextDeltaV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    text: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64_000),
    ),
    order: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAssistantReasoningDeltaV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    order: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
    ),
    text: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64_000),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatAgentToolCallUpdatedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    toolCallId: GlobalChatSessionToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    summary: Schema.String.check(Schema.isMaxLength(4_000)),
    progress: Schema.optionalKey(GlobalChatSessionAgentToolDisplayResultSchema),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["GlobalChatConversationPersistenceFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: GlobalChatSessionIdSchema,
    turnId: GlobalChatSessionTurnIdSchema,
    messageId: GlobalChatSessionMessageIdSchema,
    reason: Schema.Literals(["conversation_persistence_failed"]),
    timestamp: DateTimeUtcStringSchema,
  }),
]);
export type GlobalChatSessionLiveEvent =
  typeof GlobalChatSessionLiveEventSchema.Type;

export const GlobalChatSessionEventEnvelopeSchema = Schema.Struct({
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  eventType: Schema.String.check(Schema.isMinLength(1)),
  event: GlobalChatSessionEventSchema,
});
export const GlobalChatSessionLiveEventEnvelopeSchema = Schema.Struct({
  live: Schema.Literals([true]),
  eventType: Schema.String.check(Schema.isMinLength(1)),
  event: GlobalChatSessionLiveEventSchema,
});
export const GlobalChatSessionSseEnvelopeSchema = Schema.Union([
  GlobalChatSessionEventEnvelopeSchema,
  GlobalChatSessionLiveEventEnvelopeSchema,
]);

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseGlobalChatSessionEventEnvelope(
  value: unknown,
): GlobalChatSessionEventEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["sequence", "eventType", "event"]))
    throw new Error("invalid global chat session event envelope");
  const decoded = Schema.decodeUnknownSync(
    GlobalChatSessionEventEnvelopeSchema,
  )(value);
  if (decoded.event.type !== decoded.eventType)
    throw new Error("invalid global chat session event envelope");
  return decoded;
}

export function parseGlobalChatSessionLiveEventEnvelope(
  value: unknown,
): GlobalChatSessionLiveEventEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["live", "eventType", "event"]))
    throw new Error("invalid global chat session live event envelope");
  const decoded = Schema.decodeUnknownSync(
    GlobalChatSessionLiveEventEnvelopeSchema,
  )(value);
  if (decoded.event.type !== decoded.eventType)
    throw new Error("invalid global chat session live event envelope");
  return decoded;
}

export function parseGlobalChatSessionEventStreamQuery(
  value: unknown,
): GlobalChatSessionEventStreamQuery {
  if (!isRecord(value) || !exactKeys(value, ["after"]))
    throw new Error("invalid global chat session event stream query");
  return Schema.decodeUnknownSync(GlobalChatSessionEventStreamQuerySchema)(
    value,
  );
}

export const deriveGlobalChatSessionInitialTitle = (prompt: string): string => {
  const firstLine = (prompt.trim().split(/\r\n|\n|\r/u)[0] ?? "").trim();
  return [...firstLine]
    .slice(0, GLOBAL_CHAT_SESSION_INITIAL_TITLE_MAX_CODE_POINTS)
    .join("");
};
