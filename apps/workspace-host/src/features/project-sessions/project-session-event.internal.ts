import type { ProjectSessionEvent } from "@spacezero/host-contracts";
import {
  ProjectIdSchema,
  ProjectSessionEventSchema,
  ProjectSessionGitCommitObjectIdSchema,
  ProjectSessionIdSchema,
  ProjectSessionNameSchema,
} from "@spacezero/host-contracts";
import { Schema } from "effect";

const DateTimeUtcStringSchema = Schema.String.check(
  Schema.makeFilter((value: string) => {
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString() === value;
  }),
);

export const ProjectSessionCreationRequestedInternalEventSchema = Schema.Struct(
  {
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
  },
);

export const SessionWorkspacePreparedInternalEventSchema = Schema.Struct({
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
});

export const InternalProjectSessionEventSchema = Schema.Union([
  ProjectSessionCreationRequestedInternalEventSchema,
  SessionWorkspacePreparedInternalEventSchema,
  ProjectSessionEventSchema,
]);

export type ProjectSessionCreationRequestedInternalEvent =
  typeof ProjectSessionCreationRequestedInternalEventSchema.Type;
export type SessionWorkspacePreparedInternalEvent =
  typeof SessionWorkspacePreparedInternalEventSchema.Type;

type PublicProjectSessionEventWithoutPrivateCounterpart = Exclude<
  ProjectSessionEvent,
  | { readonly type: "ProjectSessionCreationRequestedV1" }
  | { readonly type: "SessionWorkspacePreparedV1" }
>;

export type InternalProjectSessionEvent =
  | ProjectSessionCreationRequestedInternalEvent
  | SessionWorkspacePreparedInternalEvent
  | PublicProjectSessionEventWithoutPrivateCounterpart;

const eventTypeOf = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "type" in value
    ? String(value.type)
    : undefined;

export const parseInternalProjectSessionEvent = (
  value: unknown,
): InternalProjectSessionEvent => {
  switch (eventTypeOf(value)) {
    case "ProjectSessionCreationRequestedV1":
      return Schema.decodeUnknownSync(
        ProjectSessionCreationRequestedInternalEventSchema,
      )(value);
    case "SessionWorkspacePreparedV1":
      return Schema.decodeUnknownSync(
        SessionWorkspacePreparedInternalEventSchema,
      )(value);
    default:
      return Schema.decodeUnknownSync(ProjectSessionEventSchema)(
        value,
      ) as PublicProjectSessionEventWithoutPrivateCounterpart;
  }
};

export const toPublicProjectSessionEvent = (
  event: InternalProjectSessionEvent,
): ProjectSessionEvent => {
  switch (event.type) {
    case "ProjectSessionCreationRequestedV1":
      return {
        type: "ProjectSessionCreationRequestedV1",
        version: 1,
        sessionId: event.sessionId,
        projectId: event.projectId,
        name: event.name,
        sourceBranch: event.sourceBranch,
        sourceDetached: event.sourceDetached,
        sourceCommit: event.sourceCommit,
        uncommittedChangesExcluded: event.uncommittedChangesExcluded,
        managedBranch: event.managedBranch,
        timestamp: event.timestamp,
      };
    case "SessionWorkspacePreparationStartedV1":
      return {
        type: "SessionWorkspacePreparationStartedV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "SessionWorkspacePreparedV1":
      return {
        type: "SessionWorkspacePreparedV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionReadyV1":
      return {
        type: "ProjectSessionReadyV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "SessionWorkspacePreparationFailedV1":
      return {
        type: "SessionWorkspacePreparationFailedV1",
        version: 1,
        sessionId: event.sessionId,
        reason: event.reason,
        timestamp: event.timestamp,
      };
    case "SessionWorkspaceCleanupRequestedV1":
      return {
        type: "SessionWorkspaceCleanupRequestedV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "SessionWorkspaceCleanupSucceededV1":
      return {
        type: "SessionWorkspaceCleanupSucceededV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "SessionWorkspaceCleanupFailedV1":
      return {
        type: "SessionWorkspaceCleanupFailedV1",
        version: 1,
        sessionId: event.sessionId,
        reason: event.reason,
        timestamp: event.timestamp,
      };
    case "ProjectSessionProvisioningFailedV1":
      return {
        type: "ProjectSessionProvisioningFailedV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionRecoveryRequiredV1":
      return {
        type: "ProjectSessionRecoveryRequiredV1",
        version: 1,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionRuntimeConfiguredV1":
      return {
        type: "ProjectSessionRuntimeConfiguredV1",
        version: 1,
        sessionId: event.sessionId,
        commandId: event.commandId,
        providerId: event.providerId,
        modelId: event.modelId,
        defaultThinkingLevel: event.defaultThinkingLevel,
        revision: event.revision,
        timestamp: event.timestamp,
      };
    case "ProjectSessionFollowUpQueuedV1":
      return {
        type: "ProjectSessionFollowUpQueuedV1",
        version: 1,
        sessionId: event.sessionId,
        followUpId: event.followUpId,
        commandId: event.commandId,
        prompt: event.prompt,
        position: event.position,
        timestamp: event.timestamp,
      };
    case "ProjectSessionFollowUpDispatchedV1":
      return {
        type: "ProjectSessionFollowUpDispatchedV1",
        version: 1,
        sessionId: event.sessionId,
        followUpId: event.followUpId,
        commandId: event.commandId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionFollowUpConsumedV1":
      return {
        type: "ProjectSessionFollowUpConsumedV1",
        version: 1,
        sessionId: event.sessionId,
        followUpId: event.followUpId,
        commandId: event.commandId,
        turnId: event.turnId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionFollowUpCancelledV1":
      return {
        type: "ProjectSessionFollowUpCancelledV1",
        version: 1,
        sessionId: event.sessionId,
        followUpId: event.followUpId,
        commandId: event.commandId,
        timestamp: event.timestamp,
      };
    case "ProjectSessionFollowUpRecoveryRequiredV1":
      return {
        type: "ProjectSessionFollowUpRecoveryRequiredV1",
        version: 1,
        sessionId: event.sessionId,
        followUpId: event.followUpId,
        commandId: event.commandId,
        timestamp: event.timestamp,
      };
    case "UserMessageSubmittedV1":
      return {
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId: event.sessionId,
        messageId: event.messageId,
        commandId: event.commandId,
        prompt: event.prompt,
        timestamp: event.timestamp,
      };
    case "AgentTurnStartedV1":
      return {
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        messageId: event.messageId,
        providerId: event.providerId,
        modelId: event.modelId,
        thinkingLevel: event.thinkingLevel,
        timestamp: event.timestamp,
      };
    case "AgentMessageCheckpointedV1":
      return {
        type: "AgentMessageCheckpointedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        messageId: event.messageId,
        text: event.text,
        timestamp: event.timestamp,
      };
    case "AgentMessageCompletedV1":
      return {
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        messageId: event.messageId,
        text: event.text,
        timestamp: event.timestamp,
      };
    case "AgentTurnFailedV1":
      return {
        type: "AgentTurnFailedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        reason: event.reason,
        failureCategory: event.failureCategory,
        retryable: event.retryable,
        ...(event.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: event.retryAfterMs }),
        timestamp: event.timestamp,
      };
    case "AgentTurnInterruptedV1":
      return {
        type: "AgentTurnInterruptedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        reason: event.reason,
        timestamp: event.timestamp,
      };
    case "AgentToolCallStartedV1":
      return {
        type: "AgentToolCallStartedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ...(event.safety === undefined ? {} : { safety: event.safety }),
        ...(event.approvalStatus === undefined
          ? {}
          : { approvalStatus: event.approvalStatus }),
        ...(event.approvalReason === undefined
          ? {}
          : { approvalReason: event.approvalReason }),
        timestamp: event.timestamp,
      };
    case "AgentToolCallCompletedV1":
      return {
        type: "AgentToolCallCompletedV1",
        version: 1,
        sessionId: event.sessionId,
        turnId: event.turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.status,
        ...(event.safety === undefined ? {} : { safety: event.safety }),
        ...(event.approvalStatus === undefined
          ? {}
          : { approvalStatus: event.approvalStatus }),
        ...(event.approvalReason === undefined
          ? {}
          : { approvalReason: event.approvalReason }),
        timestamp: event.timestamp,
      };
  }
};
