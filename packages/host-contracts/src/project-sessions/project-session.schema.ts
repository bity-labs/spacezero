import { Schema } from "effect";
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
export type SessionMessageRole = "user" | "assistant";
export type ProjectSessionTurnState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "interrupted"
  | "recovery_required";

export interface SessionMessage {
  readonly id: SessionMessageId;
  readonly role: SessionMessageRole;
  readonly text: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface SubmitSessionPromptRequest {
  readonly commandId: ProjectSessionCommandId;
  readonly prompt: string;
}

export interface ProjectSessionTurn {
  readonly id: AgentTurnId;
  readonly commandId: ProjectSessionCommandId;
  readonly state: ProjectSessionTurnState;
  readonly userMessageId: SessionMessageId;
  readonly assistantMessageId: SessionMessageId;
  readonly draftText: string;
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
export const AgentToolCallIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(256),
);
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
  Schema.isMaxLength(1_000_000),
);
export const SessionMessageRoleSchema = Schema.Literals(["user", "assistant"]);
export const SessionMessageSchema = Schema.Struct({
  id: SessionMessageIdSchema,
  role: SessionMessageRoleSchema,
  text: SessionMessageTextSchema,
  sequence: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(1),
  ),
  createdAt: DateTimeUtcStringSchema,
});
export const SubmitSessionPromptRequestSchema = Schema.Struct({
  commandId: ProjectSessionCommandIdSchema,
  prompt: SessionPromptSchema,
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
  draftText: Schema.String.check(Schema.isMaxLength(1_000_000)),
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
export const ListSessionMessagesResultSchema = Schema.Struct({
  session: ProjectSessionSummarySchema,
  messages: Schema.Array(SessionMessageSchema),
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
    hostId: ProjectSessionIdSchema,
    sourceBranch: Schema.NullOr(Schema.String),
    sourceDetached: Schema.Boolean,
    sourceCommit: ProjectSessionGitCommitObjectIdSchema,
    uncommittedChangesExcluded: Schema.Boolean,
    managedBranch: Schema.String,
    worktreePath: Schema.String,
    worktreeRoot: Schema.String,
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
    canonicalWorktreePath: Schema.String,
    canonicalGitDirPath: Schema.String,
    canonicalGitCommonDirPath: Schema.String,
    worktreeDeviceId: Schema.String,
    worktreeFileId: Schema.String,
    gitDirDeviceId: Schema.String,
    gitDirFileId: Schema.String,
    commonDirDeviceId: Schema.String,
    commonDirFileId: Schema.String,
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
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentMessageCompletedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    messageId: SessionMessageIdSchema,
    text: SessionMessageTextSchema,
    timestamp: DateTimeUtcStringSchema,
  }),
  Schema.Struct({
    type: Schema.Literals(["AgentTurnFailedV1"]),
    version: Schema.Literals([1]),
    sessionId: ProjectSessionIdSchema,
    turnId: AgentTurnIdSchema,
    reason: Schema.Literals(["agent_unavailable", "agent_turn_failed"]),
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
