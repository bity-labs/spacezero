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
]);

export type ProjectSessionEvent = typeof ProjectSessionEventSchema.Type;
