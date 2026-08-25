import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { hostMigrationLoader } from "./host-migrations.js";

export const createHostDatabaseLayer = (filename: string) =>
  SqliteClient.layer({ filename, busyTimeout: "5 seconds" });

export const enableHostDatabasePragmas = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`PRAGMA foreign_keys = ON`;
});

export const runHostDatabaseMigrations = (filename: string) =>
  Effect.gen(function* () {
    yield* enableHostDatabasePragmas;
    yield* SqliteMigrator.run({ loader: hostMigrationLoader });
    yield* verifyHostDatabasePragmas;
  }).pipe(Effect.provide(createHostDatabaseLayer(filename)));

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
