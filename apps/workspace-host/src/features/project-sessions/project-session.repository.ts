import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type {
  CreateProjectSessionRequest,
  CreateProjectSessionResult,
  ProjectSessionErrorCode,
  ProjectSessionSummary,
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
  readonly state:
    "provisioning" | "ready" | "provisioning_failed" | "recovery_required";
  readonly source_branch: string | null;
  readonly source_detached: 0 | 1;
  readonly source_commit: string;
  readonly uncommitted_changes_excluded: 0 | 1;
  readonly managed_branch: string;
  readonly intended_worktree_path: string;
  readonly intended_worktree_root: string;
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
}

const fingerprint = (input: CreateProjectSessionRequest) =>
  createHash("sha256")
    .update(JSON.stringify({ projectId: input.projectId }))
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

const open = (databasePath: string) => {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
};

const getHostId = (db: DatabaseSync): string => {
  const row = db
    .prepare("SELECT host_id FROM host_metadata WHERE singleton = 1")
    .get() as { host_id: string } | undefined;
  if (!row)
    throw new ProjectSessionServiceError("project_session_catalog_unavailable");
  return row.host_id;
};

const getSession = (
  db: DatabaseSync,
  sessionId: string,
): SessionRow | undefined =>
  db
    .prepare("SELECT * FROM project_sessions WHERE session_id = ?")
    .get(sessionId) as SessionRow | undefined;

const appendEvent = (input: {
  readonly db: DatabaseSync;
  readonly sessionId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: string;
}) => {
  input.db
    .prepare(
      "INSERT INTO project_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    )
    .run(
      input.sessionId,
      input.sequence,
      randomUUID(),
      input.eventType,
      JSON.stringify(input.payload),
      input.createdAt,
    );
};

export const createProjectSessionRepository = (options: {
  readonly databasePath: string;
  readonly spaceZeroHome: string;
  readonly entropy?: SessionNameEntropy;
}) => ({
  replayOrAdmit: async (
    input: CreateProjectSessionRequest,
    project: AuthenticatedProjectRepository,
  ): Promise<ProjectSessionAdmission> => {
    const db = open(options.databasePath);
    try {
      const fp = fingerprint(input);
      db.exec("BEGIN IMMEDIATE");
      try {
        const receipt = db
          .prepare(
            "SELECT * FROM project_session_command_receipts WHERE command_id = ?",
          )
          .get(input.commandId) as ReceiptRow | undefined;
        if (receipt) {
          if (receipt.request_fingerprint !== fp)
            throw new ProjectSessionServiceError("command_id_conflict");
          const row = getSession(db, receipt.session_id);
          if (!row)
            throw new ProjectSessionServiceError(
              "project_session_catalog_unavailable",
            );
          db.exec("COMMIT");
          return {
            kind: "replayed",
            session: toSummary(row),
            worktreePath: row.intended_worktree_path,
            worktreeRoot: row.intended_worktree_root,
            project,
          };
        }
        const reservedRows = db
          .prepare("SELECT name FROM project_session_name_reservations")
          .all() as { name: string }[];
        const candidate = chooseSessionNameCandidate(
          new Set(reservedRows.map((row) => row.name)),
          options.entropy,
        );
        if (!candidate)
          throw new ProjectSessionServiceError("session_name_unavailable");
        const sessionId = randomUUID();
        const hostId = getHostId(db);
        const now = new Date().toISOString();
        const worktreeRoot = join(
          options.spaceZeroHome,
          "worktrees",
          project.projectId,
        );
        const worktreePath = join(worktreeRoot, sessionId);
        const managedBranch = `spacezero/${candidate.name}-${sessionId}`;
        appendEvent({
          db,
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
        appendEvent({
          db,
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
        db.prepare(
          "INSERT INTO project_sessions (session_id, project_id, name, host_id, state, source_branch, source_detached, source_commit, uncommitted_changes_excluded, managed_branch, intended_worktree_path, intended_worktree_root, created_at, updated_at, last_sequence) VALUES (?, ?, ?, ?, 'provisioning', ?, ?, ?, ?, ?, ?, ?, ?, ?, 2)",
        ).run(
          sessionId,
          input.projectId,
          candidate.name,
          hostId,
          project.sourceBranch,
          project.sourceDetached ? 1 : 0,
          project.headCommit,
          project.dirty ? 1 : 0,
          managedBranch,
          worktreePath,
          worktreeRoot,
          now,
          now,
        );
        db.prepare(
          "INSERT INTO project_session_name_reservations (name, base_name, session_id, allocated_at) VALUES (?, ?, ?, ?)",
        ).run(candidate.name, candidate.baseName, sessionId, now);
        db.prepare(
          "INSERT INTO project_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (?, ?, ?, 'pending', 2, ?, ?)",
        ).run(input.commandId, fp, sessionId, now, now);
        const row = getSession(db, sessionId)!;
        db.exec("COMMIT");
        return {
          kind: "admitted",
          session: toSummary(row),
          worktreePath,
          worktreeRoot,
          project,
        };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  },
  markReady: async (
    commandId: string,
    sessionId: string,
    prepared: PreparedWorktreeIdentity,
  ): Promise<CreateProjectSessionResult> => {
    const db = open(options.databasePath);
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = getSession(db, sessionId);
        if (!row)
          throw new ProjectSessionServiceError(
            "project_session_catalog_unavailable",
          );
        const now = new Date().toISOString();
        appendEvent({
          db,
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
        appendEvent({
          db,
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
        db.prepare(
          "UPDATE project_sessions SET state = 'ready', canonical_worktree_path = ?, canonical_git_dir_path = ?, canonical_git_common_dir_path = ?, worktree_device_id = ?, worktree_file_id = ?, git_dir_device_id = ?, git_dir_file_id = ?, common_dir_device_id = ?, common_dir_file_id = ?, updated_at = ?, last_sequence = ? WHERE session_id = ?",
        ).run(
          prepared.canonicalWorktreePath,
          prepared.canonicalGitDirPath,
          prepared.canonicalGitCommonDirPath,
          prepared.worktreeDeviceId,
          prepared.worktreeFileId,
          prepared.gitDirDeviceId,
          prepared.gitDirFileId,
          prepared.commonDirDeviceId,
          prepared.commonDirFileId,
          now,
          row.last_sequence + 2,
          sessionId,
        );
        db.prepare(
          "UPDATE project_session_command_receipts SET status = 'succeeded', committed_sequence = ?, updated_at = ? WHERE command_id = ?",
        ).run(row.last_sequence + 2, now, commandId);
        const updated = getSession(db, sessionId)!;
        db.exec("COMMIT");
        return { session: toSummary(updated) };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  },
  markRecoveryRequired: async (
    commandId: string,
    sessionId: string,
  ): Promise<CreateProjectSessionResult> => {
    const db = open(options.databasePath);
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = getSession(db, sessionId);
        if (!row)
          throw new ProjectSessionServiceError(
            "project_session_catalog_unavailable",
          );
        const now = new Date().toISOString();
        appendEvent({
          db,
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
        db.prepare(
          "UPDATE project_sessions SET state = 'recovery_required', updated_at = ?, last_sequence = ? WHERE session_id = ?",
        ).run(now, row.last_sequence + 1, sessionId);
        db.prepare(
          "UPDATE project_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ?, updated_at = ? WHERE command_id = ?",
        ).run(row.last_sequence + 1, now, commandId);
        const updated = getSession(db, sessionId)!;
        db.exec("COMMIT");
        return { session: toSummary(updated) };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  },
  list: async (): Promise<readonly ProjectSessionSummary[]> => {
    const db = open(options.databasePath);
    try {
      const rows = db
        .prepare(
          "SELECT * FROM project_sessions WHERE state IN ('provisioning', 'ready', 'recovery_required') ORDER BY created_at ASC, session_id ASC",
        )
        .all() as unknown as SessionRow[];
      return rows.map(toSummary);
    } finally {
      db.close();
    }
  },
  markExistingRecoveryRequired: async (sessionId: string): Promise<void> => {
    const db = open(options.databasePath);
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const row = getSession(db, sessionId);
        if (!row || row.state !== "provisioning") {
          db.exec("COMMIT");
          return;
        }
        const now = new Date().toISOString();
        appendEvent({
          db,
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
        db.prepare(
          "UPDATE project_sessions SET state = 'recovery_required', updated_at = ?, last_sequence = ? WHERE session_id = ?",
        ).run(now, row.last_sequence + 1, sessionId);
        db.prepare(
          "UPDATE project_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'session_recovery_required', committed_sequence = ?, updated_at = ? WHERE session_id = ? AND status = 'pending'",
        ).run(row.last_sequence + 1, now, sessionId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      db.close();
    }
  },
  recoveryCandidates: async (): Promise<readonly ProjectSessionSummary[]> => {
    const db = open(options.databasePath);
    try {
      const rows = db
        .prepare(
          "SELECT * FROM project_sessions WHERE state = 'provisioning' ORDER BY created_at ASC, session_id ASC",
        )
        .all() as unknown as SessionRow[];
      return rows.map(toSummary);
    } finally {
      db.close();
    }
  },
});
