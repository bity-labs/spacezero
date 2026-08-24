import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import type {
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  ProjectSessionErrorCode,
  ProjectSessionEvent,
  ProjectSessionSummary,
  SessionMessage,
  SubmitSessionPromptResult,
} from "@spacezero/host-contracts";
import type { AuthenticatedProjectRepository } from "../projects/project.model.js";
import {
  chooseSessionNameCandidate,
  type SessionNameEntropy,
} from "./project-session-name.service.js";
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
  readonly turn_id: string | null;
  readonly created_at: string;
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
  readonly event: ProjectSessionEvent;
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
    }
  | {
      readonly kind: "replayed";
      readonly result: SubmitSessionPromptResult;
    };

export type AgentTurnFailureReason = "agent_unavailable" | "agent_turn_failed";

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
});

const toEvent = (row: EventRow): DurableSessionEventRow => ({
  sessionId: row.session_id,
  sequence: row.sequence,
  eventType: row.event_type,
  event: JSON.parse(row.event_payload_json) as ProjectSessionEvent,
  createdAt: row.created_at,
});

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

const getSession = (sql: SqlClient, sessionId: string) =>
  sql<SessionRow>`SELECT * FROM project_sessions WHERE session_id = ${sessionId}`;

const getPiConversationId = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const rows =
      yield* sql<PiContextRow>`SELECT conversation_id FROM project_session_pi_contexts WHERE session_id = ${sessionId}`;
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

const getMessagesAtSequence = (
  sql: SqlClient,
  sessionId: string,
  sequence: number,
) =>
  sql<MessageRow>`SELECT * FROM project_session_messages WHERE session_id = ${sessionId} AND sequence = ${sequence}`;

const replayPromptResult = (
  sql: SqlClient,
  sessionId: string,
  receipt: ReceiptRow,
) =>
  Effect.gen(function* () {
    const sessionRows = yield* getSession(sql, sessionId);
    const agentRows = yield* getMessagesAtSequence(
      sql,
      sessionId,
      receipt.committed_sequence,
    );
    const userRows = yield* getMessagesAtSequence(
      sql,
      sessionId,
      receipt.committed_sequence - 2,
    );
    if (!sessionRows[0] || !agentRows[0] || !userRows[0])
      throw new ProjectSessionServiceError(
        "project_session_catalog_unavailable",
      );
    return {
      session: toSummary(sessionRows[0]),
      userMessage: toMessage(userRows[0]),
      agentMessage: toMessage(agentRows[0]),
    };
  });

const appendEvent = (input: {
  readonly sql: SqlClient;
  readonly sessionId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: string;
}) =>
  input.sql`INSERT INTO project_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (${input.sessionId}, ${input.sequence}, ${randomUUID()}, ${input.eventType}, 1, ${JSON.stringify(input.payload)}, ${input.createdAt})`;

export const createProjectSessionRepository = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
}) => ({
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
              yield* sql<ReceiptRow>`SELECT * FROM project_session_command_receipts WHERE command_id = ${input.commandId}`;
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

            const reservedRows = yield* sql<{
              name: string;
            }>`SELECT name FROM project_session_name_reservations`;
            const candidate = chooseSessionNameCandidate(
              new Set(reservedRows.map((row) => row.name)),
              options.entropy,
            );
            if (!candidate)
              throw new ProjectSessionServiceError("session_name_unavailable");

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

            yield* appendEvent({
              sql,
              sessionId,
              sequence: 1,
              eventType: "ProjectSessionCreationRequestedV1",
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
              eventType: "SessionWorkspacePreparationStartedV1",
              payload: {
                type: "SessionWorkspacePreparationStartedV1",
                version: 1,
                sessionId,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`INSERT INTO project_sessions (session_id, project_id, name, host_id, state, source_branch, source_detached, source_commit, uncommitted_changes_excluded, managed_branch, intended_worktree_path, intended_worktree_root, created_at, updated_at, last_sequence) VALUES (${sessionId}, ${input.projectId}, ${candidate.name}, ${hostId}, 'provisioning', ${project.sourceBranch}, ${project.sourceDetached ? 1 : 0}, ${project.headCommit}, ${project.dirty ? 1 : 0}, ${managedBranch}, ${worktreePath}, ${worktreeRoot}, ${now}, ${now}, 2)`;
            yield* sql`INSERT INTO project_session_pi_contexts (session_id, conversation_id, created_at, updated_at) VALUES (${sessionId}, ${sessionId}, ${now}, ${now})`;
            yield* sql`INSERT INTO project_session_name_reservations (name, base_name, session_id, allocated_at) VALUES (${candidate.name}, ${candidate.baseName}, ${sessionId}, ${now})`;
            yield* sql`INSERT INTO project_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${sessionId}, 'pending', 2, ${now}, ${now})`;

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
              eventType: "SessionWorkspacePreparedV1",
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
              eventType: "ProjectSessionReadyV1",
              payload: {
                type: "ProjectSessionReadyV1",
                version: 1,
                sessionId,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`UPDATE project_sessions SET state = 'ready', canonical_worktree_path = ${prepared.canonicalWorktreePath}, canonical_git_dir_path = ${prepared.canonicalGitDirPath}, canonical_git_common_dir_path = ${prepared.canonicalGitCommonDirPath}, worktree_device_id = ${prepared.worktreeDeviceId}, worktree_file_id = ${prepared.worktreeFileId}, git_dir_device_id = ${prepared.gitDirDeviceId}, git_dir_file_id = ${prepared.gitDirFileId}, common_dir_device_id = ${prepared.commonDirDeviceId}, common_dir_file_id = ${prepared.commonDirFileId}, updated_at = ${now}, last_sequence = ${row.last_sequence + 2} WHERE session_id = ${sessionId}`;
            yield* sql`UPDATE project_session_command_receipts SET status = 'succeeded', committed_sequence = ${row.last_sequence + 2}, updated_at = ${now} WHERE command_id = ${commandId}`;

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
              eventType: "ProjectSessionRecoveryRequiredV1",
              payload: {
                type: "ProjectSessionRecoveryRequiredV1",
                version: 1,
                sessionId,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`UPDATE project_sessions SET state = 'recovery_required', updated_at = ${now}, last_sequence = ${row.last_sequence + 1} WHERE session_id = ${sessionId}`;
            yield* sql`UPDATE project_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ${row.last_sequence + 1}, updated_at = ${now} WHERE command_id = ${commandId}`;

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
        const rows =
          yield* sql<SessionRow>`SELECT * FROM project_sessions WHERE state IN ('provisioning', 'ready', 'recovery_required') ORDER BY created_at ASC, session_id ASC`;
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
              yield* sql<ReceiptRow>`SELECT * FROM project_session_command_receipts WHERE session_id = ${sessionId} AND status = 'pending'`;
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
              eventType: "ProjectSessionRecoveryRequiredV1",
              payload: {
                type: "ProjectSessionRecoveryRequiredV1",
                version: 1,
                sessionId,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`UPDATE project_sessions SET state = 'recovery_required', updated_at = ${now}, last_sequence = ${row.last_sequence + 1} WHERE session_id = ${sessionId}`;
            yield* sql`UPDATE project_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ${row.last_sequence + 1}, updated_at = ${now} WHERE session_id = ${sessionId} AND status = 'pending'`;
          }),
        );
      }),
    ),

  recoveryCandidates: async (): Promise<readonly ProjectSessionSummary[]> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows =
          yield* sql<SessionRow>`SELECT * FROM project_sessions WHERE state = 'provisioning' OR (state = 'ready' AND EXISTS (SELECT 1 FROM project_session_command_receipts WHERE project_session_command_receipts.session_id = project_sessions.session_id AND project_session_command_receipts.status = 'pending')) ORDER BY created_at ASC, session_id ASC`;
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
          yield* sql<ReceiptRow>`SELECT * FROM project_session_command_receipts WHERE command_id = ${input.commandId}`;
        if (!receipt[0]) return undefined;
        if (receipt[0].request_fingerprint !== fp)
          throw new ProjectSessionServiceError("command_id_conflict");
        if (receipt[0].status === "pending")
          throw new ProjectSessionServiceError("session_turn_in_progress");
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

  getSessionForPrompt: async (sessionId: string) =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0]) throw new ProjectSessionServiceError("session_not_found");
        if (rows[0].state !== "ready")
          throw new ProjectSessionServiceError("session_not_ready");
        const conversationId = yield* getPiConversationId(sql, sessionId);
        return toWorktreeIdentity(rows[0], conversationId);
      }),
    ),

  admitPrompt: async (input: PromptAdmissionInput): Promise<PromptAdmission> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const fp = promptFingerprint(input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const receipt =
              yield* sql<ReceiptRow>`SELECT * FROM project_session_command_receipts WHERE command_id = ${input.commandId}`;
            if (receipt[0]) {
              if (receipt[0].request_fingerprint !== fp)
                throw new ProjectSessionServiceError("command_id_conflict");
              if (receipt[0].status === "pending")
                throw new ProjectSessionServiceError(
                  "session_turn_in_progress",
                );
              if (receipt[0].status === "failed")
                throw new ProjectSessionServiceError(
                  receipt[0].terminal_error_code ?? "agent_turn_failed",
                );
              if (receipt[0].status === "recovery_required")
                throw new ProjectSessionServiceError(
                  receipt[0].terminal_error_code ?? "session_recovery_required",
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
            const row = rows[0];
            const now = new Date().toISOString();
            const turnId = randomUUID();
            const userMessageId = randomUUID();
            const baseSequence = row.last_sequence;

            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence: baseSequence + 1,
              eventType: "UserMessageSubmittedV1",
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
              eventType: "AgentTurnStartedV1",
              payload: {
                type: "AgentTurnStartedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId,
                messageId: userMessageId,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`INSERT INTO project_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${userMessageId}, 'user', ${input.prompt}, ${baseSequence + 1}, ${turnId}, ${now})`;
            yield* sql`INSERT INTO project_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${input.sessionId}, 'pending', ${baseSequence + 2}, ${now}, ${now})`;
            yield* sql`UPDATE project_sessions SET updated_at = ${now}, last_sequence = ${baseSequence + 2} WHERE session_id = ${input.sessionId}`;

            return {
              kind: "admitted" as const,
              turnId,
              userMessageId,
              userSequence: baseSequence + 1,
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
            const now = new Date().toISOString();
            const agentMessageId = randomUUID();
            const agentSequence = row.last_sequence + 1;

            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence: agentSequence,
              eventType: "AgentMessageCompletedV1",
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

            yield* sql`INSERT INTO project_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${agentMessageId}, 'assistant', ${input.text}, ${agentSequence}, ${input.turnId}, ${now})`;
            yield* sql`UPDATE project_sessions SET updated_at = ${now}, last_sequence = ${agentSequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE project_session_command_receipts SET status = 'succeeded', committed_sequence = ${agentSequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;

            const userRows = yield* getMessagesAtSequence(
              sql,
              input.sessionId,
              agentSequence - 2,
            );
            const updated = yield* getSession(sql, input.sessionId);
            if (!userRows[0] || !updated[0])
              throw new ProjectSessionServiceError(
                "project_session_catalog_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              userMessage: toMessage(userRows[0]),
              agentMessage: {
                id: agentMessageId,
                role: "assistant" as const,
                text: input.text,
                sequence: agentSequence,
                createdAt: now,
              },
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
            const row = rows[0];
            const now = new Date().toISOString();
            const sequence = row.last_sequence + 1;

            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              eventType: "AgentTurnFailedV1",
              payload: {
                type: "AgentTurnFailedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                reason: input.reason,
                timestamp: now,
              },
              createdAt: now,
            });

            yield* sql`UPDATE project_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE project_session_command_receipts SET status = 'failed', terminal_error_code = ${input.reason}, committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;
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
        if (!rows[0]) throw new ProjectSessionServiceError("session_not_found");
        const messageRows =
          yield* sql<MessageRow>`SELECT * FROM project_session_messages WHERE session_id = ${sessionId} AND sequence < ${sequence} ORDER BY sequence ASC`;
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
  }> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0]) throw new ProjectSessionServiceError("session_not_found");
        const messageRows =
          yield* sql<MessageRow>`SELECT * FROM project_session_messages WHERE session_id = ${sessionId} ORDER BY sequence ASC`;
        return {
          session: toSummary(rows[0]),
          messages: messageRows.map(toMessage),
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
        if (!rows[0]) throw new ProjectSessionServiceError("session_not_found");
        const eventRows =
          yield* sql<EventRow>`SELECT session_id, sequence, event_type, event_payload_json, created_at FROM project_session_events WHERE session_id = ${sessionId} AND sequence > ${after} ORDER BY sequence ASC`;
        return eventRows.map(toEvent);
      }),
    ),
});
