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

export const createProjectSessionsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE host_metadata (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  host_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
)`;
  yield* sql`INSERT INTO host_metadata (singleton, host_id, created_at) VALUES (1, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
  yield* sql`
CREATE TABLE project_session_events (
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version = 1),
  event_payload_json TEXT NOT NULL CHECK (json_valid(event_payload_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, sequence)
)`;
  yield* sql`
CREATE TABLE project_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE CHECK (name GLOB '[a-z0-9]*'),
  host_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('provisioning', 'ready', 'provisioning_failed', 'recovery_required')),
  source_branch TEXT,
  source_detached INTEGER NOT NULL CHECK (source_detached IN (0, 1)),
  source_commit TEXT NOT NULL CHECK (length(source_commit) IN (40, 64) AND source_commit NOT GLOB '*[^0-9a-f]*'),
  uncommitted_changes_excluded INTEGER NOT NULL CHECK (uncommitted_changes_excluded IN (0, 1)),
  managed_branch TEXT NOT NULL,
  intended_worktree_path TEXT NOT NULL,
  intended_worktree_root TEXT NOT NULL,
  canonical_worktree_path TEXT,
  canonical_git_dir_path TEXT,
  canonical_git_common_dir_path TEXT,
  worktree_device_id TEXT,
  worktree_file_id TEXT,
  git_dir_device_id TEXT,
  git_dir_file_id TEXT,
  common_dir_device_id TEXT,
  common_dir_file_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence > 0),
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
CREATE TABLE project_session_name_reservations (
  name TEXT PRIMARY KEY NOT NULL,
  base_name TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  allocated_at TEXT NOT NULL
)`;
  yield* sql`
CREATE TABLE project_session_command_receipts (
  command_id TEXT PRIMARY KEY NOT NULL,
  request_fingerprint TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'recovery_required')),
  terminal_error_code TEXT,
  committed_sequence INTEGER NOT NULL CHECK (committed_sequence > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX project_sessions_list_order ON project_sessions(created_at, session_id)`;
  yield* sql`CREATE INDEX project_sessions_project_state ON project_sessions(project_id, state)`;
  yield* sql`CREATE INDEX project_session_receipts_session ON project_session_command_receipts(session_id)`;
});

export const createSessionMessagesMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE project_session_messages (
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  turn_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX project_session_messages_list_order ON project_session_messages(session_id, sequence)`;
});

export const hostMigrationLoader: Migrator.Loader = Effect.succeed([
  [1, "create_project_catalog", Effect.succeed(createProjectCatalogMigration)],
  [
    2,
    "create_project_sessions",
    Effect.succeed(createProjectSessionsMigration),
  ],
  [
    3,
    "create_session_messages",
    Effect.succeed(createSessionMessagesMigration),
  ],
] as const);

export const projectCatalogMigrationLoader = hostMigrationLoader;
