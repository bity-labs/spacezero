import { createHash, randomUUID } from "node:crypto";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import type {
  ProjectErrorCode,
  ProjectSummary,
  RegisterProjectRequest,
  RegisterProjectResult,
} from "@spacezero/host-contracts";
import type {
  InspectedRepository,
  ListProjectsResult,
} from "./project.model.js";

export interface ProjectRow {
  readonly project_id: string;
  readonly display_name: string;
  readonly canonical_root_path: string;
  readonly canonical_git_dir_path: string;
  readonly canonical_git_common_dir_path: string;
  readonly root_device_id: string;
  readonly root_file_id: string;
  readonly common_dir_device_id: string;
  readonly common_dir_file_id: string;
  readonly registered_head_commit: string;
  readonly created_at: string;
}
interface ReceiptRow {
  readonly command_id: string;
  readonly request_fingerprint: string;
  readonly project_id: string;
  readonly outcome: "registered" | "existing";
}

export class ProjectRepositoryError extends Error {
  constructor(readonly code: ProjectErrorCode) {
    super(code);
  }
}

const summary = (row: ProjectRow): ProjectSummary => ({
  id: row.project_id,
  displayName: row.display_name,
  canonicalPath: row.canonical_root_path,
  registeredHeadCommit: row.registered_head_commit,
  createdAt: row.created_at,
});

const fingerprint = (input: RegisterProjectRequest) =>
  createHash("sha256")
    .update(JSON.stringify({ path: input.path }))
    .digest("hex");

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

const findProjectById = (sql: SqlClient, id: string) =>
  sql<ProjectRow>`SELECT * FROM projects WHERE project_id = ${id}`;

const replayReceipt = async (
  databasePath: string,
  input: RegisterProjectRequest,
): Promise<RegisterProjectResult | undefined> => {
  const fp = fingerprint(input);
  return runSql(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      const receipt =
        yield* sql<ReceiptRow>`SELECT * FROM project_registration_receipts WHERE command_id = ${input.commandId}`;
      if (!receipt[0]) return undefined;
      if (receipt[0].request_fingerprint !== fp)
        throw new ProjectRepositoryError("command_id_conflict");
      const rows = yield* findProjectById(sql, receipt[0].project_id);
      if (!rows[0])
        throw new ProjectRepositoryError("project_catalog_unavailable");
      return { outcome: receipt[0].outcome, project: summary(rows[0]) };
    }),
  );
};

const findExisting = (sql: SqlClient, repo: InspectedRepository) =>
  sql<ProjectRow>`
SELECT * FROM projects
WHERE canonical_root_path = ${repo.canonicalRootPath}
   OR (root_device_id = ${repo.rootDeviceId} AND root_file_id = ${repo.rootFileId})
   OR canonical_git_common_dir_path = ${repo.canonicalGitCommonDirPath}
   OR (common_dir_device_id = ${repo.commonDirDeviceId} AND common_dir_file_id = ${repo.commonDirFileId})
ORDER BY created_at ASC, project_id ASC
LIMIT 1`;

const ensureRepositoryIdentityMatches = (
  row: ProjectRow,
  repo: InspectedRepository,
) => {
  if (
    row.canonical_root_path !== repo.canonicalRootPath ||
    row.canonical_git_dir_path !== repo.canonicalGitDirPath ||
    row.canonical_git_common_dir_path !== repo.canonicalGitCommonDirPath ||
    row.root_device_id !== repo.rootDeviceId ||
    row.root_file_id !== repo.rootFileId ||
    row.common_dir_device_id !== repo.commonDirDeviceId ||
    row.common_dir_file_id !== repo.commonDirFileId
  )
    throw new ProjectRepositoryError("repository_identity_mismatch");
};

export const createProjectsRepository = (databasePath: string) => ({
  replayRegistration: (input: RegisterProjectRequest) =>
    replayReceipt(databasePath, input),
  register: async (
    input: RegisterProjectRequest,
    repo: InspectedRepository,
  ): Promise<RegisterProjectResult> => {
    const fp = fingerprint(input);
    return runSql(
      databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const receipt =
              yield* sql<ReceiptRow>`SELECT * FROM project_registration_receipts WHERE command_id = ${input.commandId}`;
            if (receipt[0]) {
              if (receipt[0].request_fingerprint !== fp)
                throw new ProjectRepositoryError("command_id_conflict");
              const rows = yield* findProjectById(sql, receipt[0].project_id);
              if (!rows[0])
                throw new ProjectRepositoryError("project_catalog_unavailable");
              return {
                outcome: receipt[0].outcome,
                project: summary(rows[0]),
              };
            }

            const existing = yield* findExisting(sql, repo);
            if (existing[0]) {
              ensureRepositoryIdentityMatches(existing[0], repo);
              yield* sql`INSERT INTO project_registration_receipts (command_id, request_fingerprint, project_id, outcome, created_at) VALUES (${input.commandId}, ${fp}, ${existing[0].project_id}, 'existing', ${new Date().toISOString()})`;
              return {
                outcome: "existing" as const,
                project: summary(existing[0]),
              };
            }

            const id = randomUUID();
            const createdAt = new Date().toISOString();
            try {
              yield* sql`INSERT INTO projects (project_id, display_name, canonical_root_path, canonical_git_dir_path, canonical_git_common_dir_path, root_device_id, root_file_id, common_dir_device_id, common_dir_file_id, registered_head_commit, created_at) VALUES (${id}, ${repo.displayName}, ${repo.canonicalRootPath}, ${repo.canonicalGitDirPath}, ${repo.canonicalGitCommonDirPath}, ${repo.rootDeviceId}, ${repo.rootFileId}, ${repo.commonDirDeviceId}, ${repo.commonDirFileId}, ${repo.headCommit}, ${createdAt})`;
            } catch {
              const winner = yield* findExisting(sql, repo);
              if (!winner[0])
                throw new ProjectRepositoryError("project_catalog_unavailable");
              ensureRepositoryIdentityMatches(winner[0], repo);
              yield* sql`INSERT INTO project_registration_receipts (command_id, request_fingerprint, project_id, outcome, created_at) VALUES (${input.commandId}, ${fp}, ${winner[0].project_id}, 'existing', ${createdAt})`;
              return {
                outcome: "existing" as const,
                project: summary(winner[0]),
              };
            }
            yield* sql`INSERT INTO project_registration_receipts (command_id, request_fingerprint, project_id, outcome, created_at) VALUES (${input.commandId}, ${fp}, ${id}, 'registered', ${createdAt})`;
            return {
              outcome: "registered" as const,
              project: {
                id,
                displayName: repo.displayName,
                canonicalPath: repo.canonicalRootPath,
                registeredHeadCommit: repo.headCommit,
                createdAt,
              },
            };
          }),
        );
      }),
    );
  },
  getProjectRegistration: async (
    projectId: string,
  ): Promise<ProjectRow | undefined> =>
    runSql(
      databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* findProjectById(sql, projectId);
        return rows[0];
      }),
    ),
  list: async (): Promise<ListProjectsResult> =>
    runSql(
      databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows =
          yield* sql<ProjectRow>`SELECT * FROM projects ORDER BY created_at ASC, project_id ASC`;
        return { projects: rows.map(summary) };
      }),
    ),
});
