import { Effect } from "effect";
import type * as Migrator from "effect/unstable/sql/Migrator";
import { SqlClient } from "effect/unstable/sql/SqlClient";

export const createProjectCatalogMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  canonical_root_path TEXT NOT NULL UNIQUE,
  canonical_git_dir_path TEXT NOT NULL,
  canonical_git_common_dir_path TEXT NOT NULL UNIQUE,
  root_device_id TEXT NOT NULL,
  root_file_id TEXT NOT NULL,
  common_dir_device_id TEXT NOT NULL,
  common_dir_file_id TEXT NOT NULL,
  registered_head_commit TEXT NOT NULL CHECK (length(registered_head_commit) IN (40, 64) AND registered_head_commit NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  UNIQUE (root_device_id, root_file_id),
  UNIQUE (common_dir_device_id, common_dir_file_id)
)`;
  yield* sql`
CREATE TABLE project_registration_receipts (
  command_id TEXT PRIMARY KEY NOT NULL,
  request_fingerprint TEXT NOT NULL,
  project_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('registered', 'existing')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(project_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX projects_list_order ON projects(created_at, project_id)`;
});

export const projectCatalogMigrationLoader: Migrator.Loader = Effect.succeed([
  [1, "create_project_catalog", Effect.succeed(createProjectCatalogMigration)],
] as const);
