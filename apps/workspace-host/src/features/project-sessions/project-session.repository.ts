import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import type {
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  AgentTurnFailureCategory,
  CancelProjectSessionFollowUpResult,
  EnqueueProjectSessionFollowUpRequest,
  EnqueueProjectSessionFollowUpResult,
  ListProjectSessionFollowUpsResult,
  ProjectSessionErrorCode,
  ProjectSessionFollowUp,
  ProjectSessionRuntimeConfiguration,
  ProjectSessionSummary,
  ProjectSessionTurn,
  UpdateProjectSessionRuntimeRequest,
  UpdateProjectSessionRuntimeResult,
  SessionMessage,
  SubmitSessionPromptResult,
} from "@spacezero/host-contracts";
import type { AuthenticatedProjectRepository } from "../projects/project.model.js";
import { getAgentRuntimeDefaults } from "../agent-runtime/agent-runtime-defaults.repository.js";
import {
  chooseSessionNameCandidate,
  type SessionNameEntropy,
} from "./project-session-name.service.js";
import {
  parseInternalProjectSessionEvent,
  type InternalProjectSessionEvent,
} from "./project-session-event.internal.js";
import {
  ProjectSessionServiceError,
  type PreparedWorktreeIdentity,
  type ProjectSessionAdmission,
} from "./project-session.model.js";

interface SessionRow {
  readonly session_id: string;
  readonly project_id: string;
  readonly name: string;
  readonly host_id: string;
  readonly state:
    "provisioning" | "ready" | "provisioning_failed" | "recovery_required";
  readonly source_branch: string | null;
  readonly source_detached: 0 | 1;
  readonly source_commit: string;
  readonly uncommitted_changes_excluded: 0 | 1;
  readonly managed_branch: string;
  readonly intended_worktree_path: string;
  readonly intended_worktree_root: string;
  readonly canonical_worktree_path: string | null;
  readonly canonical_git_dir_path: string | null;
  readonly canonical_git_common_dir_path: string | null;
  readonly worktree_device_id: string | null;
  readonly worktree_file_id: string | null;
  readonly git_dir_device_id: string | null;
  readonly git_dir_file_id: string | null;
  readonly common_dir_device_id: string | null;
  readonly common_dir_file_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_sequence: number;
}

interface ReceiptRow {
  readonly command_id: string;
  readonly request_fingerprint: string;
  readonly session_id: string;
  readonly status: "pending" | "succeeded" | "failed" | "recovery_required";
  readonly terminal_error_code: ProjectSessionErrorCode | null;
  readonly committed_sequence: number;
}

interface MessageRow {
  readonly session_id: string;
  readonly message_id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly sequence: number;
  readonly command_id?: string | null;
  readonly turn_id: string | null;
  readonly created_at: string;
}

interface FollowUpRow {
  readonly session_id: string;
  readonly follow_up_id: string;
  readonly command_id: string;
  readonly prompt: string;
  readonly state:
    "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
  readonly position: number;
  readonly dispatched_turn_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface RuntimeConfigurationRow {
  readonly session_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly default_thinking_level:
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface TurnRow {
  readonly session_id: string;
  readonly turn_id: string;
  readonly command_id: string;
  readonly user_message_id: string;
  readonly assistant_message_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly thinking_level: RuntimeConfigurationRow["default_thinking_level"];
  readonly state:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "interrupted"
    | "recovery_required";
  readonly draft_text: string;
  readonly failure_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface PiContextRow {
  readonly conversation_id: string;
}

interface EventRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly event_payload_json: string;
  readonly created_at: string;
}

export interface DurableSessionEventRow {
  readonly sessionId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly event: InternalProjectSessionEvent;
  readonly createdAt: string;
}

export interface SessionWorktreeIdentity {
  readonly sessionId: string;
  readonly projectId: string;
  readonly conversationId: string;
  readonly intendedWorktreePath: string;
  readonly managedBranch: string;
  readonly sourceCommit: string;
  readonly canonicalWorktreePath: string | null;
  readonly canonicalGitDirPath: string | null;
  readonly canonicalGitCommonDirPath: string | null;
  readonly worktreeDeviceId: string | null;
  readonly worktreeFileId: string | null;
  readonly gitDirDeviceId: string | null;
  readonly gitDirFileId: string | null;
  readonly commonDirDeviceId: string | null;
  readonly commonDirFileId: string | null;
}

export interface PromptAdmissionInput {
  readonly commandId: string;
  readonly sessionId: string;
  readonly prompt: string;
}

export interface AgentTurnHistoryMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export type PromptAdmission =
  | {
      readonly kind: "admitted";
      readonly turnId: string;
      readonly userMessageId: string;
      readonly userSequence: number;
      readonly result: SubmitSessionPromptResult;
    }
  | {
      readonly kind: "replayed";
      readonly result: SubmitSessionPromptResult;
    };

export type AgentTurnFailureReason =
  | "agent_configuration_invalid"
  | "agent_unavailable"
  | "agent_turn_failed"
  | "agent_authentication_required";
export type AgentTurnInterruptReason = "user_interrupted" | "host_shutdown";

const fingerprint = (input: CreateProjectSessionRequest) =>
  createHash("sha256")
    .update(JSON.stringify({ projectId: input.projectId }))
    .digest("hex");

const promptFingerprint = (input: PromptAdmissionInput) =>
  createHash("sha256")
    .update(
      JSON.stringify({ sessionId: input.sessionId, prompt: input.prompt }),
    )
    .digest("hex");

const followUpFingerprint = (
  sessionId: string,
  input: EnqueueProjectSessionFollowUpRequest,
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        sessionId,
        prompt: input.prompt.trim(),
        kind: "follow_up",
      }),
    )
    .digest("hex");

const runtimeFingerprint = (
  sessionId: string,
  input: UpdateProjectSessionRuntimeRequest,
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        defaultThinkingLevel: input.defaultThinkingLevel,
        expectedRevision: input.expectedRevision,
      }),
    )
    .digest("hex");

const toSummary = (row: SessionRow): ProjectSessionSummary => ({
  id: row.session_id,
  projectId: row.project_id,
  name: row.name,
  state: row.state === "provisioning_failed" ? "recovery_required" : row.state,
  sourceBranch: row.source_branch,
  sourceDetached: row.source_detached === 1,
  sourceCommit: row.source_commit,
  uncommittedChangesExcluded: row.uncommitted_changes_excluded === 1,
  managedBranch: row.managed_branch,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSequence: row.last_sequence,
});

const toMessage = (row: MessageRow): SessionMessage => ({
  id: row.message_id,
  role: row.role,
  text: row.text,
  sequence: row.sequence,
  createdAt: row.created_at,
  ...(row.command_id === undefined || row.command_id === null
    ? {}
    : { commandId: row.command_id }),
  ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
  parts: [
    {
      id: `${row.message_id}:text:1`,
      type: "text",
      order: 1,
      text: row.text,
      ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
    },
  ],
});

const failureDetails = (
  reason: string | null,
): {
  readonly failureReason: string;
  readonly failureCategory: AgentTurnFailureCategory;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
} | null => {
  if (!reason) return null;
  switch (reason) {
    case "agent_configuration_invalid":
      return {
        failureReason: reason,
        failureCategory: "configuration",
        retryable: false,
      };
    case "agent_authentication_required":
      return {
        failureReason: reason,
        failureCategory: "authentication",
        retryable: false,
      };
    case "agent_unavailable":
      return {
        failureReason: reason,
        failureCategory: "system",
        retryable: false,
      };
    case "user_interrupted":
    case "host_shutdown":
      return {
        failureReason: reason,
        failureCategory: "interrupted",
        retryable: false,
      };
    default:
      return {
        failureReason: reason,
        failureCategory: "provider",
        retryable: false,
      };
  }
};

const toTurn = (row: TurnRow): ProjectSessionTurn => ({
  id: row.turn_id,
  commandId: row.command_id,
  state: row.state,
  userMessageId: row.user_message_id,
  assistantMessageId: row.assistant_message_id,
  providerId: row.provider_id,
  modelId: row.model_id,
  thinkingLevel: row.thinking_level,
  draftText: row.draft_text,
  ...(failureDetails(row.failure_reason) ?? {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toFollowUp = (row: FollowUpRow): ProjectSessionFollowUp => ({
  id: row.follow_up_id,
  commandId: row.command_id,
  sessionId: row.session_id,
  prompt: row.prompt,
  state: row.state,
  position: row.position,
  ...(row.dispatched_turn_id === null
    ? {}
    : { dispatchedTurnId: row.dispatched_turn_id }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRuntimeConfiguration = (
  row: RuntimeConfigurationRow,
): ProjectSessionRuntimeConfiguration => ({
  providerId: row.provider_id,
  modelId: row.model_id,
  defaultThinkingLevel: row.default_thinking_level,
  revision: row.revision,
});

const toEvent = (row: EventRow): DurableSessionEventRow => {
  const event = parseInternalProjectSessionEvent(
    JSON.parse(row.event_payload_json),
  );
  if (row.event_type !== event.type)
    throw new ProjectSessionServiceError("project_session_catalog_unavailable");
  return {
    sessionId: row.session_id,
    sequence: row.sequence,
    eventType: event.type,
    event,
    createdAt: row.created_at,
  };
};

const toWorktreeIdentity = (
  row: SessionRow,
  conversationId: string,
): SessionWorktreeIdentity => ({
  sessionId: row.session_id,
  projectId: row.project_id,
  conversationId,
  intendedWorktreePath: row.intended_worktree_path,
  managedBranch: row.managed_branch,
  sourceCommit: row.source_commit,
  canonicalWorktreePath: row.canonical_worktree_path,
  canonicalGitDirPath: row.canonical_git_dir_path,
  canonicalGitCommonDirPath: row.canonical_git_common_dir_path,
  worktreeDeviceId: row.worktree_device_id,
  worktreeFileId: row.worktree_file_id,
  gitDirDeviceId: row.git_dir_device_id,
  gitDirFileId: row.git_dir_file_id,
  commonDirDeviceId: row.common_dir_device_id,
  commonDirFileId: row.common_dir_file_id,
});

const runSql = async <A>(
  databasePath: string,
  effect: Effect.Effect<A, unknown, SqlClient>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;
      return yield* effect;
    }).pipe(Effect.provide(SqliteClient.layer({ filename: databasePath }))),
  );

const projectSessionSelect = `
  SELECT
    psb.session_id,
    psb.project_id,
    psb.name,
    psb.host_id,
    psb.state,
    psb.source_branch,
    psb.source_detached,
    psb.source_commit,
    psb.uncommitted_changes_excluded,
    psb.managed_branch,
    psb.intended_worktree_path,
    psb.intended_worktree_root,
    psb.canonical_worktree_path,
    psb.canonical_git_dir_path,
    psb.canonical_git_common_dir_path,
    psb.worktree_device_id,
    psb.worktree_file_id,
    psb.git_dir_device_id,
    psb.git_dir_file_id,
    psb.common_dir_device_id,
    psb.common_dir_file_id,
    cs.created_at,
    cs.updated_at,
    cs.last_sequence
  FROM chat_sessions cs
  JOIN project_session_bindings psb ON psb.session_id = cs.session_id
  WHERE cs.kind = 'project'
`;

const getSession = (sql: SqlClient, sessionId: string) =>
  sql.unsafe<SessionRow>(`${projectSessionSelect} AND cs.session_id = ?`, [
    sessionId,
  ]);

const getPiConversationId = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const rows =
      yield* sql<PiContextRow>`SELECT conversation_id FROM chat_session_pi_contexts WHERE session_id = ${sessionId}`;
    if (!rows[0])
      throw new ProjectSessionServiceError(
        "project_session_catalog_unavailable",
      );
    return rows[0].conversation_id;
  });

const getHostId = (sql: SqlClient) =>
  Effect.gen(function* () {
    const rows = yield* sql<{
      host_id: string;
    }>`SELECT host_id FROM host_metadata WHERE singleton = 1`;
    if (!rows[0])
      throw new ProjectSessionServiceError(
        "project_session_catalog_unavailable",
      );
    return rows[0].host_id;
  });

const getMessageById = (sql: SqlClient, sessionId: string, messageId: string) =>
  sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.user_message_id = m.message_id OR t.assistant_message_id = m.message_id) WHERE m.session_id = ${sessionId} AND m.message_id = ${messageId}`;

const replayPromptResult = (
  sql: SqlClient,
  sessionId: string,
  receipt: ReceiptRow,
) =>
  Effect.gen(function* () {
    const sessionRows = yield* getSession(sql, sessionId);
    const turnRows =
      yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND command_id = ${receipt.command_id}`;
    if (!sessionRows[0] || !turnRows[0])
      throw new ProjectSessionServiceError(
        "project_session_catalog_unavailable",
      );
    const userRows = yield* getMessageById(
      sql,
      sessionId,
      turnRows[0].user_message_id,
    );
    if (!userRows[0])
      throw new ProjectSessionServiceError(
        "project_session_catalog_unavailable",
      );
    return {
      session: toSummary(sessionRows[0]),
      turn: toTurn(turnRows[0]),
      userMessage: toMessage(userRows[0]),
    };
  });

const appendEvent = (input: {
  readonly sql: SqlClient;
  readonly sessionId: string;
  readonly sequence: number;
  readonly payload: InternalProjectSessionEvent;
  readonly createdAt: string;
}) =>
  input.sql`INSERT INTO chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (${input.sessionId}, ${input.sequence}, ${randomUUID()}, ${input.payload.type}, 1, ${JSON.stringify(input.payload)}, ${input.createdAt})`;

export const createProjectSessionRepository = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
}) => {
  return {
    replayOrAdmit: async (
      input: CreateProjectSessionRequest,
      project: AuthenticatedProjectRepository,
    ): Promise<ProjectSessionAdmission> => {
      const fp = fingerprint(input);
      return runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const receipt =
                yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
              if (receipt[0]) {
                if (receipt[0].request_fingerprint !== fp)
                  throw new ProjectSessionServiceError("command_id_conflict");
                const rows = yield* getSession(sql, receipt[0].session_id);
                if (!rows[0])
                  throw new ProjectSessionServiceError(
                    "project_session_catalog_unavailable",
                  );
                return {
                  kind: "replayed" as const,
                  session: toSummary(rows[0]),
                  worktreePath: rows[0].intended_worktree_path,
                  worktreeRoot: rows[0].intended_worktree_root,
                  project,
                };
              }

              const defaults = yield* getAgentRuntimeDefaults(sql);
              if (
                !defaults.defaultModel ||
                defaults.defaultThinkingLevel === null
              )
                throw new ProjectSessionServiceError(
                  "agent_default_model_missing",
                );
              const seededRuntime = {
                providerId: defaults.defaultModel.providerId,
                modelId: defaults.defaultModel.modelId,
                defaultThinkingLevel: defaults.defaultThinkingLevel,
              };

              const reservedRows = yield* sql<{
                name: string;
              }>`SELECT name FROM project_session_name_reservations`;
              const candidate = chooseSessionNameCandidate(
                new Set(reservedRows.map((row) => row.name)),
                options.entropy,
              );
              if (!candidate)
                throw new ProjectSessionServiceError(
                  "session_name_unavailable",
                );

              const sessionId = randomUUID();
              const hostId = yield* getHostId(sql);
              const now = new Date().toISOString();
              const worktreeRoot = join(
                options.spaceZeroHome,
                "worktrees",
                project.projectId,
              );
              const worktreePath = join(worktreeRoot, sessionId);
              const managedBranch = `spacezero/${candidate.name}-${sessionId}`;

              yield* sql`INSERT INTO chat_sessions (session_id, kind, title, archived_at, created_at, updated_at, last_sequence) VALUES (${sessionId}, 'project', NULL, NULL, ${now}, ${now}, 3)`;
              yield* sql`INSERT INTO project_session_bindings (session_id, project_id, name, host_id, state, source_branch, source_detached, source_commit, uncommitted_changes_excluded, managed_branch, intended_worktree_path, intended_worktree_root) VALUES (${sessionId}, ${input.projectId}, ${candidate.name}, ${hostId}, 'provisioning', ${project.sourceBranch}, ${project.sourceDetached ? 1 : 0}, ${project.headCommit}, ${project.dirty ? 1 : 0}, ${managedBranch}, ${worktreePath}, ${worktreeRoot})`;

              yield* appendEvent({
                sql,
                sessionId,
                sequence: 1,
                payload: {
                  type: "ProjectSessionCreationRequestedV1",
                  version: 1,
                  sessionId,
                  projectId: input.projectId,
                  name: candidate.name,
                  hostId,
                  sourceBranch: project.sourceBranch,
                  sourceDetached: project.sourceDetached,
                  sourceCommit: project.headCommit,
                  uncommittedChangesExcluded: project.dirty,
                  managedBranch,
                  worktreePath,
                  worktreeRoot,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* appendEvent({
                sql,
                sessionId,
                sequence: 2,
                payload: {
                  type: "ProjectSessionRuntimeConfiguredV1",
                  version: 1,
                  sessionId,
                  commandId: input.commandId,
                  providerId: seededRuntime.providerId,
                  modelId: seededRuntime.modelId,
                  defaultThinkingLevel: seededRuntime.defaultThinkingLevel,
                  revision: 1,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* appendEvent({
                sql,
                sessionId,
                sequence: 3,
                payload: {
                  type: "SessionWorkspacePreparationStartedV1",
                  version: 1,
                  sessionId,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`INSERT INTO chat_session_pi_contexts (session_id, conversation_id, created_at, updated_at) VALUES (${sessionId}, ${sessionId}, ${now}, ${now})`;
              yield* sql`INSERT INTO chat_session_runtime_configurations (session_id, provider_id, model_id, default_thinking_level, revision, created_at, updated_at) VALUES (${sessionId}, ${seededRuntime.providerId}, ${seededRuntime.modelId}, ${seededRuntime.defaultThinkingLevel}, 1, ${now}, ${now})`;
              yield* sql`INSERT INTO project_session_name_reservations (name, base_name, session_id, allocated_at) VALUES (${candidate.name}, ${candidate.baseName}, ${sessionId}, ${now})`;
              yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${sessionId}, 'pending', 3, ${now}, ${now})`;

              const rows = yield* getSession(sql, sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return {
                kind: "admitted" as const,
                session: toSummary(rows[0]),
                worktreePath,
                worktreeRoot,
                project,
              };
            }),
          );
        }),
      );
    },

    markReady: async (
      commandId: string,
      sessionId: string,
      prepared: PreparedWorktreeIdentity,
    ): Promise<CreateProjectSessionResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              const row = rows[0];
              const now = new Date().toISOString();

              yield* appendEvent({
                sql,
                sessionId,
                sequence: row.last_sequence + 1,
                payload: {
                  type: "SessionWorkspacePreparedV1",
                  version: 1,
                  sessionId,
                  ...prepared,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* appendEvent({
                sql,
                sessionId,
                sequence: row.last_sequence + 2,
                payload: {
                  type: "ProjectSessionReadyV1",
                  version: 1,
                  sessionId,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`UPDATE project_session_bindings SET state = 'ready', canonical_worktree_path = ${prepared.canonicalWorktreePath}, canonical_git_dir_path = ${prepared.canonicalGitDirPath}, canonical_git_common_dir_path = ${prepared.canonicalGitCommonDirPath}, worktree_device_id = ${prepared.worktreeDeviceId}, worktree_file_id = ${prepared.worktreeFileId}, git_dir_device_id = ${prepared.gitDirDeviceId}, git_dir_file_id = ${prepared.gitDirFileId}, common_dir_device_id = ${prepared.commonDirDeviceId}, common_dir_file_id = ${prepared.commonDirFileId} WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${row.last_sequence + 2} WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'succeeded', committed_sequence = ${row.last_sequence + 2}, updated_at = ${now} WHERE command_id = ${commandId}`;

              const updated = yield* getSession(sql, sessionId);
              if (!updated[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return { session: toSummary(updated[0]) };
            }),
          );
        }),
      ),

    markRecoveryRequired: async (
      commandId: string,
      sessionId: string,
    ): Promise<CreateProjectSessionResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              const row = rows[0];
              const now = new Date().toISOString();

              yield* appendEvent({
                sql,
                sessionId,
                sequence: row.last_sequence + 1,
                payload: {
                  type: "ProjectSessionRecoveryRequiredV1",
                  version: 1,
                  sessionId,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`UPDATE project_session_bindings SET state = 'recovery_required' WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${row.last_sequence + 1} WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ${row.last_sequence + 1}, updated_at = ${now} WHERE command_id = ${commandId}`;

              const updated = yield* getSession(sql, sessionId);
              if (!updated[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return { session: toSummary(updated[0]) };
            }),
          );
        }),
      ),

    list: async (): Promise<readonly ProjectSessionSummary[]> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* sql.unsafe<SessionRow>(
            `${projectSessionSelect} AND psb.state IN ('provisioning', 'ready', 'recovery_required') ORDER BY cs.created_at ASC, cs.session_id ASC`,
          );
          return rows.map(toSummary);
        }),
      ),

    markExistingRecoveryRequired: async (sessionId: string): Promise<void> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, sessionId);
              if (!rows[0] || rows[0].state === "recovery_required") return;
              const pendingReceipts =
                yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE session_id = ${sessionId} AND status = 'pending'`;
              if (
                rows[0].state !== "provisioning" &&
                pendingReceipts.length === 0
              )
                return;
              const row = rows[0];
              const now = new Date().toISOString();

              yield* appendEvent({
                sql,
                sessionId,
                sequence: row.last_sequence + 1,
                payload: {
                  type: "ProjectSessionRecoveryRequiredV1",
                  version: 1,
                  sessionId,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`UPDATE project_session_bindings SET state = 'recovery_required' WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${row.last_sequence + 1} WHERE session_id = ${sessionId}`;
              yield* sql`UPDATE chat_session_turns SET state = 'recovery_required', failure_reason = 'session_recovery_required', updated_at = ${now} WHERE session_id = ${sessionId} AND state IN ('queued', 'running')`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ${row.last_sequence + 1}, updated_at = ${now} WHERE session_id = ${sessionId} AND status = 'pending'`;
            }),
          );
        }),
      ),

    recoveryCandidates: async (): Promise<readonly ProjectSessionSummary[]> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* sql.unsafe<SessionRow>(
            `${projectSessionSelect} AND (psb.state = 'provisioning' OR (psb.state = 'ready' AND EXISTS (SELECT 1 FROM chat_session_command_receipts receipt WHERE receipt.session_id = cs.session_id AND receipt.status = 'pending'))) ORDER BY cs.created_at ASC, cs.session_id ASC`,
          );
          return rows.map(toSummary);
        }),
      ),

    replayOrRejectPromptReceipt: async (
      input: PromptAdmissionInput,
    ): Promise<SubmitSessionPromptResult | undefined> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const fp = promptFingerprint(input);
          const receipt =
            yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
          if (!receipt[0]) return undefined;
          if (receipt[0].request_fingerprint !== fp)
            throw new ProjectSessionServiceError("command_id_conflict");
          if (receipt[0].status === "failed")
            throw new ProjectSessionServiceError(
              receipt[0].terminal_error_code ?? "agent_turn_failed",
            );
          if (receipt[0].status === "recovery_required")
            throw new ProjectSessionServiceError(
              receipt[0].terminal_error_code ?? "session_recovery_required",
            );
          return yield* replayPromptResult(sql, input.sessionId, receipt[0]);
        }),
      ),

    listFollowUps: async (
      sessionId: string,
    ): Promise<ListProjectSessionFollowUpsResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          const followUps =
            yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} ORDER BY position ASC, created_at ASC`;
          return {
            session: toSummary(rows[0]),
            followUps: followUps.map(toFollowUp),
          };
        }),
      ),

    enqueueFollowUp: async (
      sessionId: string,
      input: EnqueueProjectSessionFollowUpRequest,
    ): Promise<EnqueueProjectSessionFollowUpResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const fp = followUpFingerprint(sessionId, input);
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const existingFollowUp =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE command_id = ${input.commandId}`;
              if (existingFollowUp[0]) {
                if (
                  followUpFingerprint(existingFollowUp[0].session_id, {
                    commandId: input.commandId,
                    prompt: existingFollowUp[0].prompt,
                  }) !== fp
                )
                  throw new ProjectSessionServiceError("command_id_conflict");
                const sessionRows = yield* getSession(
                  sql,
                  existingFollowUp[0].session_id,
                );
                if (!sessionRows[0])
                  throw new ProjectSessionServiceError(
                    "follow_up_queue_unavailable",
                  );
                return {
                  session: toSummary(sessionRows[0]),
                  followUp: toFollowUp(existingFollowUp[0]),
                };
              }
              const sessionRows = yield* getSession(sql, sessionId);
              if (!sessionRows[0])
                throw new ProjectSessionServiceError("session_not_found");
              if (sessionRows[0].state !== "ready")
                throw new ProjectSessionServiceError("session_not_ready");
              const positionRows = yield* sql<{
                position: number | null;
              }>`SELECT max(position) AS position FROM project_session_follow_ups WHERE session_id = ${sessionId}`;
              const position = (positionRows[0]?.position ?? 0) + 1;
              const followUpId = randomUUID();
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionFollowUpQueuedV1",
                  version: 1,
                  sessionId,
                  followUpId,
                  commandId: input.commandId,
                  prompt: input.prompt.trim(),
                  position,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`INSERT INTO project_session_follow_ups (session_id, follow_up_id, command_id, prompt, state, position, created_at, updated_at) VALUES (${sessionId}, ${followUpId}, ${input.commandId}, ${input.prompt.trim()}, 'queued', ${position}, ${now}, ${now})`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
              const updated = yield* getSession(sql, sessionId);
              const followUpRows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
              if (!updated[0] || !followUpRows[0])
                throw new ProjectSessionServiceError(
                  "follow_up_queue_unavailable",
                );
              return {
                session: toSummary(updated[0]),
                followUp: toFollowUp(followUpRows[0]),
              };
            }),
          );
        }),
      ),

    cancelFollowUp: async (
      sessionId: string,
      followUpId: string,
    ): Promise<CancelProjectSessionFollowUpResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const sessionRows = yield* getSession(sql, sessionId);
              if (!sessionRows[0])
                throw new ProjectSessionServiceError("session_not_found");
              const followUpRows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
              if (!followUpRows[0])
                throw new ProjectSessionServiceError("follow_up_not_found");
              if (followUpRows[0].state !== "queued")
                throw new ProjectSessionServiceError(
                  "follow_up_not_cancellable",
                );
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionFollowUpCancelledV1",
                  version: 1,
                  sessionId,
                  followUpId,
                  commandId: followUpRows[0].command_id,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE project_session_follow_ups SET state = 'cancelled', updated_at = ${now} WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
              const updated = yield* getSession(sql, sessionId);
              const updatedFollowUp =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
              if (!updated[0] || !updatedFollowUp[0])
                throw new ProjectSessionServiceError(
                  "follow_up_queue_unavailable",
                );
              return {
                session: toSummary(updated[0]),
                followUp: toFollowUp(updatedFollowUp[0]),
              };
            }),
          );
        }),
      ),

    dispatchNextFollowUp: async (
      sessionId: string,
    ): Promise<ProjectSessionFollowUp | undefined> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const sessionRows = yield* getSession(sql, sessionId);
              if (!sessionRows[0]) return undefined;
              const activeTurns =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running') LIMIT 1`;
              if (activeTurns[0]) return undefined;
              const followUpRows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} AND state = 'queued' ORDER BY position ASC, created_at ASC LIMIT 1`;
              if (!followUpRows[0]) return undefined;
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionFollowUpDispatchedV1",
                  version: 1,
                  sessionId,
                  followUpId: followUpRows[0].follow_up_id,
                  commandId: followUpRows[0].command_id,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE project_session_follow_ups SET state = 'dispatched', updated_at = ${now} WHERE session_id = ${sessionId} AND follow_up_id = ${followUpRows[0].follow_up_id}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
              const updatedFollowUp =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpRows[0].follow_up_id}`;
              return updatedFollowUp[0]
                ? toFollowUp(updatedFollowUp[0])
                : undefined;
            }),
          );
        }),
      ),

    markFollowUpConsumed: async (input: {
      readonly sessionId: string;
      readonly followUpId: string;
      readonly turnId: string;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const sessionRows = yield* getSession(sql, input.sessionId);
              const followUpRows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
              if (!sessionRows[0] || !followUpRows[0]) return;
              if (followUpRows[0].state !== "dispatched") return;
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionFollowUpConsumedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  followUpId: input.followUpId,
                  commandId: followUpRows[0].command_id,
                  turnId: input.turnId,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE project_session_follow_ups SET state = 'consumed', dispatched_turn_id = ${input.turnId}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            }),
          );
        }),
      );
    },

    markFollowUpRecoveryRequired: async (input: {
      readonly sessionId: string;
      readonly followUpId: string;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const sessionRows = yield* getSession(sql, input.sessionId);
              const followUpRows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
              if (!sessionRows[0] || !followUpRows[0]) return;
              if (followUpRows[0].state !== "dispatched") return;
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionFollowUpRecoveryRequiredV1",
                  version: 1,
                  sessionId: input.sessionId,
                  followUpId: input.followUpId,
                  commandId: followUpRows[0].command_id,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE project_session_follow_ups SET state = 'recovery_required', updated_at = ${now} WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId} AND state = 'dispatched'`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            }),
          );
        }),
      );
    },

    markDispatchedFollowUpsRecoveryRequired: async (): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows =
                yield* sql<FollowUpRow>`SELECT * FROM project_session_follow_ups WHERE state = 'dispatched' ORDER BY updated_at ASC`;
              for (const row of rows) {
                const sessionRows = yield* getSession(sql, row.session_id);
                if (!sessionRows[0]) continue;
                const now = new Date().toISOString();
                const sequence = sessionRows[0].last_sequence + 1;
                yield* appendEvent({
                  sql,
                  sessionId: row.session_id,
                  sequence,
                  payload: {
                    type: "ProjectSessionFollowUpRecoveryRequiredV1",
                    version: 1,
                    sessionId: row.session_id,
                    followUpId: row.follow_up_id,
                    commandId: row.command_id,
                    timestamp: now,
                  },
                  createdAt: now,
                });
                yield* sql`UPDATE project_session_follow_ups SET state = 'recovery_required', updated_at = ${now} WHERE session_id = ${row.session_id} AND follow_up_id = ${row.follow_up_id}`;
                yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${row.session_id}`;
              }
            }),
          );
        }),
      );
    },

    getRuntime: async (
      sessionId: string,
    ): Promise<{
      readonly session: ProjectSessionSummary;
      readonly runtime: ProjectSessionRuntimeConfiguration;
    }> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          const runtimeRows =
            yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
          if (!runtimeRows[0])
            throw new ProjectSessionServiceError(
              "project_session_catalog_unavailable",
            );
          return {
            session: toSummary(rows[0]),
            runtime: toRuntimeConfiguration(runtimeRows[0]),
          };
        }),
      ),

    updateRuntime: async (
      sessionId: string,
      input: UpdateProjectSessionRuntimeRequest,
      validateSelection?: () => Promise<void>,
    ): Promise<UpdateProjectSessionRuntimeResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const fp = runtimeFingerprint(sessionId, input);
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const receipt =
                yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
              if (receipt[0]) {
                if (receipt[0].request_fingerprint !== fp)
                  throw new ProjectSessionServiceError("command_id_conflict");
                const current = yield* getSession(sql, sessionId);
                const runtimeEvents = yield* sql<{
                  event_payload_json: string;
                }>`SELECT event_payload_json FROM chat_session_events WHERE session_id = ${sessionId} AND event_type = 'ProjectSessionRuntimeConfiguredV1' AND json_extract(event_payload_json, '$.commandId') = ${input.commandId} LIMIT 1`;
                if (!current[0] || !runtimeEvents[0])
                  throw new ProjectSessionServiceError(
                    "project_session_catalog_unavailable",
                  );
                const event = parseInternalProjectSessionEvent(
                  JSON.parse(runtimeEvents[0].event_payload_json),
                );
                if (event.type !== "ProjectSessionRuntimeConfiguredV1")
                  throw new ProjectSessionServiceError(
                    "project_session_catalog_unavailable",
                  );
                return {
                  session: toSummary(current[0]),
                  runtime: {
                    providerId: event.providerId,
                    modelId: event.modelId,
                    defaultThinkingLevel: event.defaultThinkingLevel,
                    revision: event.revision,
                  },
                };
              }
              const rows = yield* getSession(sql, sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              if (rows[0].state !== "ready")
                throw new ProjectSessionServiceError("session_not_ready");
              const activeTurns =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running') LIMIT 1`;
              if (activeTurns[0])
                throw new ProjectSessionServiceError(
                  "session_turn_in_progress",
                );
              const runtimeRows =
                yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
              if (!runtimeRows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              if (runtimeRows[0].revision !== input.expectedRevision)
                throw new ProjectSessionServiceError(
                  "session_runtime_revision_conflict",
                );
              if (validateSelection) yield* Effect.promise(validateSelection);
              const now = new Date().toISOString();
              const nextRevision = runtimeRows[0].revision + 1;
              const sequence = rows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId,
                sequence,
                payload: {
                  type: "ProjectSessionRuntimeConfiguredV1",
                  version: 1,
                  sessionId,
                  commandId: input.commandId,
                  providerId: input.providerId,
                  modelId: input.modelId,
                  defaultThinkingLevel: input.defaultThinkingLevel,
                  revision: nextRevision,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_session_runtime_configurations SET provider_id = ${input.providerId}, model_id = ${input.modelId}, default_thinking_level = ${input.defaultThinkingLevel}, revision = ${nextRevision}, updated_at = ${now} WHERE session_id = ${sessionId}`;
              yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${sessionId}, 'succeeded', ${sequence}, ${now}, ${now})`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
              const updated = yield* getSession(sql, sessionId);
              const updatedRuntime =
                yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
              if (!updated[0] || !updatedRuntime[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return {
                session: toSummary(updated[0]),
                runtime: toRuntimeConfiguration(updatedRuntime[0]),
              };
            }),
          );
        }),
      ),

    getSessionForPrompt: async (sessionId: string) =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          if (rows[0].state !== "ready")
            throw new ProjectSessionServiceError("session_not_ready");
          const conversationId = yield* getPiConversationId(sql, sessionId);
          return toWorktreeIdentity(rows[0], conversationId);
        }),
      ),

    admitPrompt: async (
      input: PromptAdmissionInput,
    ): Promise<PromptAdmission> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const fp = promptFingerprint(input);
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const receipt =
                yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
              if (receipt[0]) {
                if (receipt[0].request_fingerprint !== fp)
                  throw new ProjectSessionServiceError("command_id_conflict");
                if (receipt[0].status === "failed")
                  throw new ProjectSessionServiceError(
                    receipt[0].terminal_error_code ?? "agent_turn_failed",
                  );
                if (receipt[0].status === "recovery_required")
                  throw new ProjectSessionServiceError(
                    receipt[0].terminal_error_code ??
                      "session_recovery_required",
                  );
                const result = yield* replayPromptResult(
                  sql,
                  input.sessionId,
                  receipt[0],
                );
                return { kind: "replayed" as const, result };
              }

              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              if (rows[0].state !== "ready")
                throw new ProjectSessionServiceError("session_not_ready");
              const runtimeRows =
                yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${input.sessionId}`;
              if (!runtimeRows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              const runtime = toRuntimeConfiguration(runtimeRows[0]);
              const activeTurns =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND state IN ('queued', 'running') LIMIT 1`;
              if (activeTurns[0])
                throw new ProjectSessionServiceError(
                  "session_turn_in_progress",
                );
              const row = rows[0];
              const now = new Date().toISOString();
              const turnId = randomUUID();
              const userMessageId = randomUUID();
              const assistantMessageId = randomUUID();
              const baseSequence = row.last_sequence;

              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence: baseSequence + 1,
                payload: {
                  type: "UserMessageSubmittedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  messageId: userMessageId,
                  commandId: input.commandId,
                  prompt: input.prompt,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence: baseSequence + 2,
                payload: {
                  type: "AgentTurnStartedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId,
                  messageId: assistantMessageId,
                  providerId: runtime.providerId,
                  modelId: runtime.modelId,
                  thinkingLevel: runtime.defaultThinkingLevel,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`INSERT INTO chat_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${userMessageId}, 'user', ${input.prompt}, ${baseSequence + 1}, ${turnId}, ${now})`;
              yield* sql`INSERT INTO chat_session_turns (session_id, turn_id, command_id, user_message_id, assistant_message_id, provider_id, model_id, thinking_level, state, draft_text, created_at, updated_at) VALUES (${input.sessionId}, ${turnId}, ${input.commandId}, ${userMessageId}, ${assistantMessageId}, ${runtime.providerId}, ${runtime.modelId}, ${runtime.defaultThinkingLevel}, 'running', '', ${now}, ${now})`;
              yield* sql`UPDATE chat_session_pi_contexts SET last_turn_id = ${turnId}, updated_at = ${now} WHERE session_id = ${input.sessionId}`;
              yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${input.sessionId}, 'pending', ${baseSequence + 2}, ${now}, ${now})`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${baseSequence + 2} WHERE session_id = ${input.sessionId}`;

              const updated = yield* getSession(sql, input.sessionId);
              const userRows = yield* getMessageById(
                sql,
                input.sessionId,
                userMessageId,
              );
              const turnRows =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${turnId}`;
              if (!updated[0] || !userRows[0] || !turnRows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return {
                kind: "admitted" as const,
                turnId,
                userMessageId,
                userSequence: baseSequence + 1,
                result: {
                  session: toSummary(updated[0]),
                  turn: toTurn(turnRows[0]),
                  userMessage: toMessage(userRows[0]),
                },
              };
            }),
          );
        }),
      ),

    completeTurn: async (input: {
      readonly commandId: string;
      readonly sessionId: string;
      readonly turnId: string;
      readonly text: string;
    }): Promise<SubmitSessionPromptResult> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              const row = rows[0];
              const turnRows =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (!["queued", "running"].includes(turnRows[0].state))
                throw new ProjectSessionServiceError("turn_not_active");
              const now = new Date().toISOString();
              const agentMessageId = turnRows[0].assistant_message_id;
              const agentSequence = row.last_sequence + 1;

              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence: agentSequence,
                payload: {
                  type: "AgentMessageCompletedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  messageId: agentMessageId,
                  text: input.text,
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`INSERT INTO chat_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${agentMessageId}, 'assistant', ${input.text}, ${agentSequence}, ${input.turnId}, ${now})`;
              yield* sql`UPDATE chat_session_turns SET state = 'completed', draft_text = ${input.text}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${agentSequence} WHERE session_id = ${input.sessionId}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'succeeded', committed_sequence = ${agentSequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;

              const userRows = yield* getMessageById(
                sql,
                input.sessionId,
                turnRows[0].user_message_id,
              );
              const updated = yield* getSession(sql, input.sessionId);
              const updatedTurn =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!userRows[0] || !updated[0] || !updatedTurn[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return {
                session: toSummary(updated[0]),
                turn: toTurn(updatedTurn[0]),
                userMessage: toMessage(userRows[0]),
              };
            }),
          );
        }),
      ),

    failTurn: async (input: {
      readonly commandId: string;
      readonly sessionId: string;
      readonly turnId: string;
      readonly reason: AgentTurnFailureReason;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              const turnRows =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (!["queued", "running"].includes(turnRows[0].state)) return;
              const row = rows[0];
              const now = new Date().toISOString();
              const sequence = row.last_sequence + 1;
              const details = failureDetails(input.reason);
              if (!details)
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );

              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "AgentTurnFailedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  reason: input.reason,
                  failureCategory: details.failureCategory,
                  retryable: details.retryable,
                  ...(details.retryAfterMs === undefined
                    ? {}
                    : { retryAfterMs: details.retryAfterMs }),
                  timestamp: now,
                },
                createdAt: now,
              });

              yield* sql`UPDATE chat_session_turns SET state = 'failed', failure_reason = ${input.reason}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'failed', terminal_error_code = ${input.reason}, committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;
            }),
          );
        }),
      );
    },

    interruptTurn: async (input: {
      readonly sessionId: string;
      readonly turnId: string;
      readonly reason: AgentTurnInterruptReason;
    }): Promise<{
      readonly session: ProjectSessionSummary;
      readonly turn: ProjectSessionTurn;
    }> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              const turnRows =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (turnRows[0].state === "interrupted")
                return {
                  session: toSummary(rows[0]),
                  turn: toTurn(turnRows[0]),
                };
              if (!["queued", "running"].includes(turnRows[0].state))
                throw new ProjectSessionServiceError("turn_not_active");
              const now = new Date().toISOString();
              const sequence = rows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "AgentTurnInterruptedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  reason: input.reason,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_session_turns SET state = 'interrupted', failure_reason = ${input.reason}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'failed', terminal_error_code = 'agent_turn_failed', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${turnRows[0].command_id}`;
              const updated = yield* getSession(sql, input.sessionId);
              const updatedTurn =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!updated[0] || !updatedTurn[0])
                throw new ProjectSessionServiceError(
                  "project_session_catalog_unavailable",
                );
              return {
                session: toSummary(updated[0]),
                turn: toTurn(updatedTurn[0]),
              };
            }),
          );
        }),
      ),

    checkpointTurnDraft: async (input: {
      readonly sessionId: string;
      readonly turnId: string;
      readonly text: string;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              const turnRows =
                yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (!["queued", "running"].includes(turnRows[0].state)) return;
              const now = new Date().toISOString();
              const sequence = rows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "AgentMessageCheckpointedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  messageId: turnRows[0].assistant_message_id,
                  text: input.text,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_session_turns SET draft_text = ${input.text}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            }),
          );
        }),
      );
    },

    recordToolStarted: async (input: {
      readonly sessionId: string;
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly safety?: "read" | "write" | "dangerous";
      readonly approvalStatus?: "approved" | "requires_approval";
      readonly approvalReason?: string;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              const turnRows =
                yield* sql<TurnRow>`SELECT state FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (!["queued", "running"].includes(turnRows[0].state)) return;
              const now = new Date().toISOString();
              const sequence = rows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "AgentToolCallStartedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  toolCallId: input.toolCallId,
                  toolName: input.toolName,
                  ...(input.safety === undefined
                    ? {}
                    : { safety: input.safety }),
                  ...(input.approvalStatus === undefined
                    ? {}
                    : { approvalStatus: input.approvalStatus }),
                  ...(input.approvalReason === undefined
                    ? {}
                    : { approvalReason: input.approvalReason }),
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            }),
          );
        }),
      );
    },

    recordToolCompleted: async (input: {
      readonly sessionId: string;
      readonly turnId: string;
      readonly toolCallId: string;
      readonly toolName: string;
      readonly isError: boolean;
      readonly safety?: "read" | "write" | "dangerous";
      readonly approvalStatus?: "approved" | "requires_approval";
      readonly approvalReason?: string;
    }): Promise<void> => {
      await runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* getSession(sql, input.sessionId);
              if (!rows[0])
                throw new ProjectSessionServiceError("session_not_found");
              const turnRows =
                yield* sql<TurnRow>`SELECT state FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
              if (!turnRows[0])
                throw new ProjectSessionServiceError("turn_not_found");
              if (!["queued", "running"].includes(turnRows[0].state)) return;
              const now = new Date().toISOString();
              const sequence = rows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "AgentToolCallCompletedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  toolCallId: input.toolCallId,
                  toolName: input.toolName,
                  status: input.isError ? "failed" : "succeeded",
                  ...(input.safety === undefined
                    ? {}
                    : { safety: input.safety }),
                  ...(input.approvalStatus === undefined
                    ? {}
                    : { approvalStatus: input.approvalStatus }),
                  ...(input.approvalReason === undefined
                    ? {}
                    : { approvalReason: input.approvalReason }),
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            }),
          );
        }),
      );
    },

    listTurnHistoryBefore: async (
      sessionId: string,
      sequence: number,
    ): Promise<readonly AgentTurnHistoryMessage[]> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          const messageRows =
            yield* sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} AND sequence < ${sequence} ORDER BY sequence ASC`;
          return messageRows.map((message) => ({
            role: message.role,
            text: message.text,
          }));
        }),
      ),

    listMessages: async (
      sessionId: string,
    ): Promise<{
      readonly session: ProjectSessionSummary;
      readonly messages: readonly SessionMessage[];
      readonly activeTurn?: ProjectSessionTurn;
      readonly latestTurn?: ProjectSessionTurn;
    }> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          const messageRows =
            yield* sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.user_message_id = m.message_id OR t.assistant_message_id = m.message_id) WHERE m.session_id = ${sessionId} ORDER BY m.sequence ASC`;
          const activeTurns =
            yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running', 'recovery_required') ORDER BY updated_at DESC LIMIT 1`;
          const latestTurns =
            yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} ORDER BY updated_at DESC, turn_id DESC LIMIT 1`;
          return {
            session: toSummary(rows[0]),
            messages: messageRows.map(toMessage),
            ...(activeTurns[0] ? { activeTurn: toTurn(activeTurns[0]) } : {}),
            ...(latestTurns[0] ? { latestTurn: toTurn(latestTurns[0]) } : {}),
          };
        }),
      ),

    listEventsAfter: async (
      sessionId: string,
      after: number,
    ): Promise<readonly DurableSessionEventRow[]> =>
      runSql(
        options.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient;
          const rows = yield* getSession(sql, sessionId);
          if (!rows[0])
            throw new ProjectSessionServiceError("session_not_found");
          const eventRows =
            yield* sql<EventRow>`SELECT session_id, sequence, event_type, event_payload_json, created_at FROM chat_session_events WHERE session_id = ${sessionId} AND sequence > ${after} ORDER BY sequence ASC`;
          return eventRows.map(toEvent);
        }),
      ),
  };
};
