import type { ProjectSessionSummary } from "@spacezero/host-contracts";
import type { InternalProjectSessionEvent } from "./project-session-event.internal.js";

export interface ProjectSessionProjection extends Omit<
  ProjectSessionSummary,
  "state"
> {
  readonly state:
    "provisioning" | "ready" | "provisioning_failed" | "recovery_required";
  readonly hostId: string;
  readonly intendedWorktreePath: string;
  readonly intendedWorktreeRoot: string;
}

export const projectSessionEvent = (
  previous: ProjectSessionProjection | undefined,
  event: InternalProjectSessionEvent,
  sequence: number,
): ProjectSessionProjection => {
  if (sequence < 1) throw new Error("invalid event sequence");
  if (!previous) {
    if (event.type !== "ProjectSessionCreationRequestedV1" || sequence !== 1)
      throw new Error("invalid first event");
    return {
      id: event.sessionId,
      projectId: event.projectId,
      name: event.name,
      state: "provisioning",
      sourceBranch: event.sourceBranch,
      sourceDetached: event.sourceDetached,
      sourceCommit: event.sourceCommit,
      uncommittedChangesExcluded: event.uncommittedChangesExcluded,
      managedBranch: event.managedBranch,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      lastSequence: 1,
      hostId: event.hostId,
      intendedWorktreePath: event.worktreePath,
      intendedWorktreeRoot: event.worktreeRoot,
    };
  }
  if (event.sessionId !== previous.id || sequence !== previous.lastSequence + 1)
    throw new Error("invalid event sequence");
  const updatedAt = "timestamp" in event ? event.timestamp : previous.updatedAt;
  switch (event.type) {
    case "SessionWorkspacePreparationStartedV1":
      return { ...previous, updatedAt, lastSequence: sequence };
    case "SessionWorkspacePreparedV1":
      return { ...previous, updatedAt, lastSequence: sequence };
    case "ProjectSessionRuntimeConfiguredV1":
    case "ProjectSessionFollowUpQueuedV1":
    case "ProjectSessionFollowUpDispatchedV1":
    case "ProjectSessionFollowUpConsumedV1":
    case "ProjectSessionFollowUpCancelledV1":
    case "ProjectSessionFollowUpRecoveryRequiredV1":
    case "UserMessageSubmittedV1":
    case "AgentTurnStartedV1":
    case "AgentMessageCheckpointedV1":
    case "AgentMessageCompletedV1":
    case "AgentTurnFailedV1":
    case "AgentTurnInterruptedV1":
    case "AgentToolCallStartedV1":
    case "AgentToolCallCompletedV1":
      return { ...previous, updatedAt, lastSequence: sequence };
    case "ProjectSessionReadyV1":
      return { ...previous, state: "ready", updatedAt, lastSequence: sequence };
    case "SessionWorkspacePreparationFailedV1":
    case "SessionWorkspaceCleanupRequestedV1":
    case "SessionWorkspaceCleanupSucceededV1":
    case "SessionWorkspaceCleanupFailedV1":
      return { ...previous, updatedAt, lastSequence: sequence };
    case "ProjectSessionProvisioningFailedV1":
      return {
        ...previous,
        state: "provisioning_failed",
        updatedAt,
        lastSequence: sequence,
      };
    case "ProjectSessionRecoveryRequiredV1":
      return {
        ...previous,
        state: "recovery_required",
        updatedAt,
        lastSequence: sequence,
      };
    case "ProjectSessionCreationRequestedV1":
      throw new Error("duplicate creation event");
  }
};
