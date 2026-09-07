import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { HOST_DATA_VERSION, hostMigrationLoader } from "./host-migrations.js";

const MIGRATIONS_TABLE = "effect_sql_migrations";

/**
 * Tables owned by the Host migration chain. Their presence without a readable
 * migrations table means the database state cannot be proven safe, so startup
 * must fail closed (ADR 0044).
 *
 * Must match the tables created by `hostMigrationLoader` exactly; the Host
 * data wipe integration tests verify this against a freshly migrated
 * database so the list cannot drift from the migration chain.
 */
export const KNOWN_HOST_TABLES = [
  MIGRATIONS_TABLE,
  "projects",
  "project_registration_receipts",
  "host_metadata",
  "chat_sessions",
  "project_session_bindings",
  "project_session_name_reservations",
  "chat_session_events",
  "chat_session_messages",
  "chat_session_turns",
  "chat_session_runtime_configurations",
  "chat_session_pi_contexts",
  "chat_session_command_receipts",
  "project_session_follow_ups",
  "workspace_tool_policies",
  "agent_runtime_defaults",
  "global_chat_session_follow_ups",
  "skill_preferences",
] as const;

export class HostDataVersionRefusedError extends Error {
  readonly _tag = "HostDataVersionRefusedError";
}

const refuse = (reason: string) =>
  new HostDataVersionRefusedError(
    `refusing to start: host durable data cannot be safely recreated (${reason}); delete the host database manually if it is disposable`,
  );

/**
 * Inspect the persisted durable-data schema version without mutating it.
 * Pre-release wipe policy (ADR 0044): databases recorded below the current
 * required version are destructively recreated; states that cannot be proven
 * safe (unreadable version, Host tables without a version record, or a newer
 * recorded version) refuse to start instead of wiping or migrating.
 */
const inspectHostDataState = (filename: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const tables = yield* sql<{
      name: string;
    }>`SELECT name FROM sqlite_master WHERE type = 'table'`;
    const names = new Set(tables.map((table) => table.name));
    if (!names.has(MIGRATIONS_TABLE)) {
      const stale = KNOWN_HOST_TABLES.filter((table) => names.has(table));
      if (stale.length > 0) throw refuse("host tables without version record");
      return { kind: "fresh" } as const;
    }
    const rows = yield* sql<{
      migration_id: number;
    }>`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 1`;
    const version = rows[0]?.migration_id;
    if (version === undefined) throw refuse("empty version record");
    if (version > HOST_DATA_VERSION)
      throw refuse(
        `recorded version ${version} is newer than required ${HOST_DATA_VERSION}`,
      );
    if (version < HOST_DATA_VERSION) return { kind: "wipe" as const, version };
    return { kind: "current" } as const;
  }).pipe(Effect.provide(createHostDatabaseLayer(filename)));

const wipeHostDatabaseFiles = (filename: string) =>
  Effect.tryPromise({
    try: async () => {
      // Sidecars first so the main database file always disappears last.
      await rm(`${filename}-wal`, { force: true });
      await rm(`${filename}-shm`, { force: true });
      await rm(`${filename}-journal`, { force: true });
      await rm(filename, { force: true });
    },
    catch: (cause) =>
      new HostDataVersionRefusedError(
        `refusing to start: failed to wipe outdated host database: ${String(cause)}`,
      ),
  });

const verifyHostDataVersion = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const rows = yield* sql<{
    migration_id: number;
  }>`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 1`;
  if (rows[0]?.migration_id !== HOST_DATA_VERSION)
    throw new HostDataVersionRefusedError(
      `refusing to start: host database did not reach required version ${HOST_DATA_VERSION}`,
    );
});

export const createHostDatabaseLayer = (filename: string) =>
  SqliteClient.layer({ filename, busyTimeout: "5 seconds" });

export const enableHostDatabasePragmas = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`PRAGMA foreign_keys = ON`;
});

/**
 * Opens the database client and brings it to the current schema version. The
 * client layer is built only here, after any wipe decision, so a wiped file is
 * never held open by a stale connection.
 */
const migrateHostDatabase = (filename: string) =>
  Effect.gen(function* () {
    yield* enableHostDatabasePragmas;
    yield* SqliteMigrator.run({ loader: hostMigrationLoader });
    yield* verifyHostDataVersion;
    yield* verifyHostDatabasePragmas;
  }).pipe(Effect.provide(createHostDatabaseLayer(filename)));

export const runHostDatabaseMigrations = (filename: string) =>
  Effect.gen(function* () {
    const state = existsSync(filename)
      ? yield* inspectHostDataState(filename)
      : ({ kind: "fresh" } as const);
    if (state.kind === "wipe") {
      console.warn("wiping outdated host durable data", {
        database: filename,
        recordedVersion: state.version,
        requiredVersion: HOST_DATA_VERSION,
      });
      yield* wipeHostDatabaseFiles(filename);
    }
    yield* migrateHostDatabase(filename);
  });

export const verifyHostDatabasePragmas = Effect.gen(function* () {
  const sql = yield* SqlClient;
  const foreignKeys = yield* sql<{ foreign_keys: number }>`PRAGMA foreign_keys`;
  const journalMode = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`;
  const busyTimeout = yield* sql<{ timeout: number }>`PRAGMA busy_timeout`;
  if (foreignKeys[0]?.foreign_keys !== 1) throw new Error("foreign keys off");
  if (journalMode[0]?.journal_mode !== "wal") throw new Error("wal off");
  if (busyTimeout[0]?.timeout !== 5000)
    throw new Error("busy timeout mismatch");
});

export const makeHostDatabaseLayer = (filename: string) =>
  Layer.mergeAll(createHostDatabaseLayer(filename));
