import { Schema } from "effect";
import {
  AgentThinkingLevelSchema,
  type AgentThinkingLevel,
} from "../agent-runtime/agent-runtime.schema.js";
import { ProjectIdSchema } from "../projects/project.schema.js";

export type ProjectSessionId = string;
export type ProjectSessionCommandId = string;
export type ProjectSessionName = string;
export type ProjectSessionState =
  "provisioning" | "ready" | "recovery_required";
export type DurableProjectSessionState =
  ProjectSessionState | "provisioning_failed";

export interface ProjectSessionSummary {
  readonly id: ProjectSessionId;
  readonly projectId: string;
  readonly name: ProjectSessionName;
  readonly state: ProjectSessionState;
  readonly sourceBranch: string | null;
  readonly sourceDetached: boolean;
  readonly sourceCommit: string;
  readonly uncommittedChangesExcluded: boolean;
  readonly managedBranch: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastSequence: number;
}

export interface CreateProjectSessionRequest {
  readonly commandId: ProjectSessionCommandId;
  readonly projectId: string;
}

export interface CreateProjectSessionResult {
  readonly session: ProjectSessionSummary;
}

export interface ListProjectSessionsResult {
  readonly sessions: readonly ProjectSessionSummary[];
}

export type SessionMessageId = string;
export type AgentTurnId = string;
export type AgentToolCallId = string;
export type AgentToolApprovalStatus = "approved" | "requires_approval";
export type AgentToolSafety = "read" | "write" | "dangerous";
export type ProjectSessionFollowUpId = string;
export type SessionMessageRole = "user" | "assistant";
export type ProjectSessionFollowUpState =
  "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
export type ProjectSessionTurnState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "recovery_required";

export interface SessionTextPart {
  readonly id: string;
  readonly type: "text";
  readonly order: number;
  readonly text: string;
  readonly turnId?: AgentTurnId;
}

export interface SessionReasoningPart {
  readonly id: string;
  readonly type: "reasoning";
  readonly order: number;
  readonly text: string;
  readonly turnId?: AgentTurnId;
}

export type SessionMessagePart = SessionTextPart | SessionReasoningPart;

export interface SessionMessage {
  readonly id: SessionMessageId;
  readonly role: SessionMessageRole;
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly commandId?: ProjectSessionCommandId;
  readonly turnId?: AgentTurnId;
  readonly parts?: readonly SessionMessagePart[];
}

export interface SubmitSessionPromptRequest {
  readonly commandId: ProjectSessionCommandId;
  readonly prompt: string;
}

export interface EnqueueProjectSessionFollowUpRequest {
  readonly commandId: ProjectSessionCommandId;
  readonly prompt: string;
}

export interface ProjectSessionFollowUp {
  readonly id: ProjectSessionFollowUpId;
  readonly commandId: ProjectSessionCommandId;
  readonly sessionId: ProjectSessionId;
  readonly prompt: string;
  readonly state: ProjectSessionFollowUpState;
  readonly position: number;
  readonly dispatchedTurnId?: AgentTurnId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EnqueueProjectSessionFollowUpResult {
  readonly session: ProjectSessionSummary;
  readonly followUp: ProjectSessionFollowUp;
}

export interface ListProjectSessionFollowUpsResult {
  readonly session: ProjectSessionSummary;
  readonly followUps: readonly ProjectSessionFollowUp[];
}

export interface CancelProjectSessionFollowUpResult {
  readonly session: ProjectSessionSummary;
  readonly followUp: ProjectSessionFollowUp;
}

export interface InterruptProjectSessionTurnRequest {
  readonly commandId: ProjectSessionCommandId;
}

export type AgentTurnFailureCategory =
  | "configuration"
  | "authentication"
  | "provider"
  | "tool"
  | "interrupted"
  | "system";

export interface ProjectSessionTurn {
  readonly id: AgentTurnId;
  readonly commandId: ProjectSessionCommandId;
  readonly state: ProjectSessionTurnState;
  readonly userMessageId: SessionMessageId;
  readonly assistantMessageId: SessionMessageId;
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly draftText: string;
  readonly draftParts?: readonly SessionMessagePart[];
  readonly failureReason?: string;
  readonly failureCategory?: AgentTurnFailureCategory;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubmitSessionPromptResult {
  readonly session: ProjectSessionSummary;
  readonly turn: ProjectSessionTurn;
  readonly userMessage: SessionMessage;
}

export interface InterruptProjectSessionTurnResult {
  readonly session: ProjectSessionSummary;
  readonly turn: ProjectSessionTurn;
}

export interface ListSessionMessagesResult {
  readonly session: ProjectSessionSummary;
  readonly messages: readonly SessionMessage[];
  readonly activeTurn?: ProjectSessionTurn;
  readonly latestTurn?: ProjectSessionTurn;
}

export interface ProjectSessionRuntimeConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly defaultThinkingLevel: AgentThinkingLevel;
  readonly revision: number;
}

export interface GetProjectSessionRuntimeResult {
  readonly session: ProjectSessionSummary;
  readonly runtime: ProjectSessionRuntimeConfiguration;
}

export interface UpdateProjectSessionRuntimeRequest {
  readonly commandId: ProjectSessionCommandId;
  readonly providerId: string;
  readonly modelId: string;
  readonly defaultThinkingLevel: AgentThinkingLevel;
  readonly expectedRevision: number;
}

export interface UpdateProjectSessionRuntimeResult {
  readonly session: ProjectSessionSummary;
  readonly runtime: ProjectSessionRuntimeConfiguration;
}

export interface ProjectSessionEventStreamQuery {
  readonly after: number;
}

export interface ProjectSessionEventEnvelope {
  readonly sequence: number;
  readonly eventType: string;
  readonly event: ProjectSessionEvent;
}

export interface ProjectSessionLiveEventEnvelope {
  readonly live: true;
  readonly eventType: string;
  readonly event: ProjectSessionLiveEvent;
}

export type ProjectSessionSseEnvelope =
  ProjectSessionEventEnvelope | ProjectSessionLiveEventEnvelope;

const DateTimeUtcStringSchema = Schema.String.check(
  Schema.makeFilter((value: string) => {
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString() === value;
  }),
);

export const ProjectSessionIdSchema = Schema.String.check(Schema.isUUID());
export const ProjectSessionCommandIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const ProjectSessionNameSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
);
export const ProjectSessionStateSchema = Schema.Literals([
  "provisioning",
  "ready",
  "recovery_required",
]);
export const DurableProjectSessionStateSchema = Schema.Literals([
  "provisioning",
  "ready",
  "provisioning_failed",
  "recovery_required",
]);
export const ProjectSessionGitCommitObjectIdSchema = Schema.String.check(
  Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
);
export const SessionMessageIdSchema = Schema.String.check(Schema.isUUID());
export const AgentTurnIdSchema = Schema.String.check(Schema.isUUID());
export const ProjectSessionFollowUpIdSchema = Schema.String.check(
  Schema.isUUID(),
);
export const AgentToolCallIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256),
);
export const AgentToolSafetySchema = Schema.Literals([
  "read",
  "write",
  "dangerous",
]);
export const AgentToolApprovalStatusSchema = Schema.Literals([
  "approved",
  "requires_approval",
]);
export const AgentTurnFailureCategorySchema = Schema.Literals([
  "configuration",
  "authentication",
  "provider",
  "tool",
  "interrupted",
  "system",
]);

export const ProjectSessionFollowUpStateSchema = Schema.Literals([
  "queued",
  "dispatched",
  "consumed",
  "cancelled",
  "recovery_required",
]);

export const ProjectSessionTurnStateSchema = Schema.Literals([
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
  "recovery_required",
]);
export const SessionPromptSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16_000),
  Schema.makeFilter(
    (value: string) => value.trim().length > 0 || "prompt must not be blank",
  ),
);
export const SessionMessageTextSchema = Schema.String.check(
  Schema.isMinLength(1),
);
export const SessionMessageDraftTextSchema = Schema.String;
export const SessionMessageRoleSchema = Schema.Literals(["user", "assistant"]);
export const SessionTextPartSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  type: Schema.Literals(["text"]),
  order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  text: Schema.String,
  turnId: Schema.optionalKey(AgentTurnIdSchema),
});
export const SessionReasoningPartSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  type: Schema.Literals(["reasoning"]),
  order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  text: Schema.String.check(Schema.isMinLength(1)),
  turnId: Schema.optionalKey(AgentTurnIdSchema),
});
export const SessionMessagePartSchema = Schema.Union([
  SessionTextPartSchema,
  SessionReasoningPartSchema,
]);
export const SessionMessageSchema = Schema.Struct({
  id: SessionMessageIdSchema,
  role: SessionMessageRoleSchema,
  text: SessionMessageTextSchema,
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  createdAt: DateTimeUtcStringSchema,
  commandId: Schema.optionalKey(ProjectSessionCommandIdSchema),
  turnId: Schema.optionalKey(AgentTurnIdSchema),
  parts: Schema.optionalKey(Schema.Array(SessionMessagePartSchema)),
});
export const SubmitSessionPromptRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
  prompt: SessionPromptSchema,
});
export const EnqueueProjectSessionFollowUpRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
  prompt: SessionPromptSchema,
});
export const InterruptProjectSessionTurnRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
});
export const ProjectSessionSummarySchema = Schema.Struct({
  id: ProjectSessionIdSchema,
  projectId: ProjectIdSchema,
  name: ProjectSessionNameSchema,
  state: ProjectSessionStateSchema,
  sourceBranch: Schema.NullOr(Schema.String),
  sourceDetached: Schema.Boolean,
  sourceCommit: ProjectSessionGitCommitObjectIdSchema,
  uncommittedChangesExcluded: Schema.Boolean,
  managedBranch: Schema.String.check(
    Schema.isPattern(/^spacezero\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f-]{36}$/),
  ),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
  lastSequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
});
export const CreateProjectSessionRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
  projectId: ProjectIdSchema,
});
export const CreateProjectSessionResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
});
export const ListProjectSessionsResultSchema = Schema.Struct({
  sessions: Schema.Array(ProjectSessionSummarySchema),
});
export const ProjectSessionTurnSchema = Schema.Struct({
  id: AgentTurnIdSchema,
  commandId: ProjectSessionCommandIdSchema,
  state: ProjectSessionTurnStateSchema,
  userMessageId: SessionMessageIdSchema,
  assistantMessageId: SessionMessageIdSchema,
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  thinkingLevel: AgentThinkingLevelSchema,
  draftText: Schema.String,
  draftParts: Schema.optionalKey(Schema.Array(SessionMessagePartSchema)),
  failureReason: Schema.optionalKey(Schema.String),
  failureCategory: Schema.optionalKey(AgentTurnFailureCategorySchema),
  retryable: Schema.optionalKey(Schema.Boolean),
  retryAfterMs: Schema.optionalKey(Schema.Number),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
});
export const SubmitSessionPromptResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  turn: ProjectSessionTurnSchema,
  userMessage: SessionMessageSchema,
});
export const InterruptProjectSessionTurnResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  turn: ProjectSessionTurnSchema,
});
export const ProjectSessionFollowUpSchema = Schema.Struct({
  id: ProjectSessionFollowUpIdSchema,
  commandId: ProjectSessionCommandIdSchema,
  sessionId: ProjectSessionIdSchema,
  prompt: SessionPromptSchema,
  state: ProjectSessionFollowUpStateSchema,
  position: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  dispatchedTurnId: Schema.optionalKey(AgentTurnIdSchema),
  createdAt: DateTimeUtcStringSchema,
  updatedAt: DateTimeUtcStringSchema,
});
export const EnqueueProjectSessionFollowUpResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  followUp: ProjectSessionFollowUpSchema,
});
export const ListProjectSessionFollowUpsResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  followUps: Schema.Array(ProjectSessionFollowUpSchema),
});
export const CancelProjectSessionFollowUpResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  followUp: ProjectSessionFollowUpSchema,
});
export const ListSessionMessagesResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  messages: Schema.Array(SessionMessageSchema),
  activeTurn: Schema.optionalKey(ProjectSessionTurnSchema),
  latestTurn: Schema.optionalKey(ProjectSessionTurnSchema),
});
export const ProjectSessionRuntimeConfigurationSchema = Schema.Struct({
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
export const GetProjectSessionRuntimeResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  runtime: ProjectSessionRuntimeConfigurationSchema,
});
export const UpdateProjectSessionRuntimeRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
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
export const UpdateProjectSessionRuntimeResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  runtime: ProjectSessionRuntimeConfigurationSchema,
});

export const ProjectSessionEventStreamQuerySchema = Schema.Struct({
  after: Schema.NumberFromString.pipe(
    Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
});

export const ProjectSessionEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionCreationRequestedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    projectId: ProjectIdSchema,
    name: ProjectSessionNameSchema,
    sourceBranch: Schema.NullOr(Schema.String),
    sourceDetached: Schema.Boolean,
    sourceCommit: ProjectSessionGitCommitObjectIdSchema,
    uncommittedChangesExcluded: Schema.Boolean,
    managedBranch: Schema.String,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspacePreparationStartedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspacePreparedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionReadyV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspacePreparationFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    reason: Schema.Literals(["git_failed", "timeout", "identity_mismatch"]),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspaceCleanupRequestedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspaceCleanupSucceededV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["SessionWorkspaceCleanupFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    reason: Schema.Literals(["git_failed", "identity_mismatch"]),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionProvisioningFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionRecoveryRequiredV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionRuntimeConfiguredV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    commandId: ProjectSessionCommandIdSchema,
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
    type: Schema.Literals(["ProjectSessionFollowUpQueuedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    followUpId: ProjectSessionFollowUpIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    prompt: SessionMessageTextSchema,
    position: Schema.Number.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(1),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionFollowUpDispatchedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    followUpId: ProjectSessionFollowUpIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionFollowUpConsumedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    followUpId: ProjectSessionFollowUpIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    turnId: AgentTurnIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionFollowUpCancelledV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    followUpId: ProjectSessionFollowUpIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["ProjectSessionFollowUpRecoveryRequiredV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    followUpId: ProjectSessionFollowUpIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["UserMessageSubmittedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    messageId: SessionMessageIdSchema,
    commandId: ProjectSessionCommandIdSchema,
    prompt: SessionMessageTextSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentTurnStartedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
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
    type: Schema.Literals(["AgentMessageCheckpointedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
    text: SessionMessageDraftTextSchema,
    parts: Schema.optionalKey(Schema.Array(SessionMessagePartSchema)),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentMessageCompletedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
    text: SessionMessageTextSchema,
    parts: Schema.optionalKey(Schema.Array(SessionMessagePartSchema)),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentTurnFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    reason: Schema.String,
    failureCategory: AgentTurnFailureCategorySchema,
    retryable: Schema.Boolean,
    retryAfterMs: Schema.optionalKey(Schema.Number),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentTurnInterruptedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    reason: Schema.Literals(["user_interrupted", "host_shutdown"]),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentToolCallStartedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    toolCallId: AgentToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    safety: Schema.optionalKey(AgentToolSafetySchema),
    approvalStatus: Schema.optionalKey(AgentToolApprovalStatusSchema),
    approvalReason: Schema.optionalKey(
      Schema.String.check(Schema.isMaxLength(128)),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentToolCallCompletedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    toolCallId: AgentToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    status: Schema.Literals(["succeeded", "failed"]),
    safety: Schema.optionalKey(AgentToolSafetySchema),
    approvalStatus: Schema.optionalKey(AgentToolApprovalStatusSchema),
    approvalReason: Schema.optionalKey(
      Schema.String.check(Schema.isMaxLength(128)),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
]);

export type ProjectSessionEvent = typeof ProjectSessionEventSchema.Type;

export const ProjectSessionLiveEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literals(["AssistantTextDeltaV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
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
    type: Schema.Literals(["AssistantReasoningDeltaV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
    order: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    text: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64_000),
    ),
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentToolCallUpdatedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    toolCallId: AgentToolCallIdSchema,
    toolName: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(128),
    ),
    summary: Schema.String.check(Schema.isMaxLength(4_000)),
    timestamp: DateTimeUtcStringSchema,
  }),
]);

export type ProjectSessionLiveEvent = typeof ProjectSessionLiveEventSchema.Type;

export const ProjectSessionEventEnvelopeSchema = Schema.Struct({
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  eventType: Schema.String.check(Schema.isMinLength(1)),
  event: ProjectSessionEventSchema,
});
export const ProjectSessionLiveEventEnvelopeSchema = Schema.Struct({
  live: Schema.Literals([true]),
  eventType: Schema.String.check(Schema.isMinLength(1)),
  event: ProjectSessionLiveEventSchema,
});
export const ProjectSessionSseEnvelopeSchema = Schema.Union([
  ProjectSessionEventEnvelopeSchema,
  ProjectSessionLiveEventEnvelopeSchema,
]);

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseProjectSessionEventEnvelope(
  value: unknown,
): ProjectSessionEventEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["sequence", "eventType", "event"]))
    throw new Error("invalid project session event envelope");
  const decoded = Schema.decodeUnknownSync(ProjectSessionEventEnvelopeSchema)(
    value,
  );
  if (decoded.event.type !== decoded.eventType)
    throw new Error("invalid project session event envelope");
  if (decoded.event.sessionId === undefined)
    throw new Error("invalid project session event envelope");
  return decoded;
}

export function parseProjectSessionLiveEventEnvelope(
  value: unknown,
): ProjectSessionLiveEventEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["live", "eventType", "event"]))
    throw new Error("invalid project session live event envelope");
  const decoded = Schema.decodeUnknownSync(
    ProjectSessionLiveEventEnvelopeSchema,
  )(value);
  if (decoded.event.type !== decoded.eventType)
    throw new Error("invalid project session live event envelope");
  return decoded;
}

export function parseProjectSessionEventStreamQuery(
  value: unknown,
): ProjectSessionEventStreamQuery {
  if (!isRecord(value) || !exactKeys(value, ["after"]))
    throw new Error("invalid project session event stream query");
  return Schema.decodeUnknownSync(ProjectSessionEventStreamQuerySchema)(value);
}
