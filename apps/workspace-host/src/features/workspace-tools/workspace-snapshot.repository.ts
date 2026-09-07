import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export interface WorkspaceSessionSnapshot {
  readonly projectCount: number;
  readonly unarchivedGlobalChatCount: number;
  readonly activeGlobalChatSessionId?: string;
  readonly activeProjectSessionId?: string;
}

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

interface ActiveSessionRow {
  readonly session_id: string;
  readonly kind: "project" | "global";
}

/**
 * Sanitized, Host-owned snapshot behind `workspace.getStatus`: counts and
 * active session ids only. No versions, paths, ports, URLs, capabilities,
 * diagnostics, or Host internals are exposed.
 */
export const readWorkspaceSessionSnapshot = (
  databasePath: string,
): Promise<WorkspaceSessionSnapshot> =>
  runSql(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      const counts = yield* sql<{
        project_count: number;
        unarchived_global_chat_count: number;
      }>`SELECT (SELECT COUNT(*) FROM projects) AS project_count, (SELECT COUNT(*) FROM chat_sessions WHERE kind = 'global' AND archived_at IS NULL) AS unarchived_global_chat_count`;
      const activeRows =
        yield* sql<ActiveSessionRow>`SELECT s.session_id, s.kind FROM chat_sessions s JOIN chat_session_turns t ON t.session_id = s.session_id AND t.state = 'running' WHERE s.kind = 'project' OR (s.kind = 'global' AND s.archived_at IS NULL) ORDER BY t.updated_at DESC, s.session_id DESC`;
      const activeGlobalChatSessionId = activeRows.find(
        (row) => row.kind === "global",
      )?.session_id;
      const activeProjectSessionId = activeRows.find(
        (row) => row.kind === "project",
      )?.session_id;
      return {
        projectCount: counts[0]?.project_count ?? 0,
        unarchivedGlobalChatCount: counts[0]?.unarchived_global_chat_count ?? 0,
        ...(activeGlobalChatSessionId === undefined
          ? {}
          : { activeGlobalChatSessionId }),
        ...(activeProjectSessionId === undefined
          ? {}
          : { activeProjectSessionId }),
      };
    }),
  );
