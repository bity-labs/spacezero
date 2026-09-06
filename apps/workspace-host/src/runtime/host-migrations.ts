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

export const createChatSessionsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE host_metadata (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  host_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
)`;
  yield* sql`INSERT INTO host_metadata (singleton, host_id, created_at) VALUES (1, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
  yield* sql`
CREATE TABLE chat_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'global')),
  title TEXT CHECK (
    title IS NULL OR (
      length(title) BETWEEN 1 AND 60
      AND instr(title, char(10)) = 0
      AND instr(title, char(13)) = 0
    )
  ),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence > 0),
  CHECK (kind <> 'global' OR title IS NOT NULL),
  CHECK (kind <> 'project' OR title IS NULL),
  CHECK (kind <> 'project' OR archived_at IS NULL)
)`;
  yield* sql`CREATE INDEX chat_sessions_kind_created_order ON chat_sessions(kind, created_at, session_id)`;
  yield* sql`CREATE INDEX chat_sessions_kind_updated_order ON chat_sessions(kind, archived_at, updated_at, session_id)`;
  yield* sql`
CREATE TABLE project_session_bindings (
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
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (project_id) REFERENCES projects(project_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX project_session_bindings_project_state ON project_session_bindings(project_id, state)`;
  yield* sql`
CREATE TRIGGER project_session_bindings_require_project_kind
BEFORE INSERT ON project_session_bindings
FOR EACH ROW
WHEN (SELECT kind FROM chat_sessions WHERE session_id = NEW.session_id) <> 'project'
BEGIN
  SELECT RAISE(ABORT, 'project_session_binding_requires_project_chat_session');
END`;
  yield* sql`
CREATE TABLE project_session_name_reservations (
  name TEXT PRIMARY KEY NOT NULL,
  base_name TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  allocated_at TEXT NOT NULL
)`;
  yield* sql`
CREATE TABLE chat_session_events (
  session_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version = 1),
  event_payload_json TEXT NOT NULL CHECK (json_valid(event_payload_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
CREATE TABLE chat_session_messages (
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL CHECK (role = 'assistant' OR length(text) > 0),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  turn_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX chat_session_messages_list_order ON chat_session_messages(session_id, sequence)`;
  yield* sql`
CREATE TABLE chat_session_turns (
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL DEFAULT 'anthropic',
  model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  thinking_level TEXT NOT NULL DEFAULT 'off' CHECK (thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'interrupted', 'recovery_required')),
  draft_text TEXT NOT NULL DEFAULT '',
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX chat_session_turns_state ON chat_session_turns(session_id, state)`;
  yield* sql`
CREATE TABLE chat_session_runtime_configurations (
  session_id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 128),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 256),
  default_thinking_level TEXT NOT NULL CHECK (default_thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
CREATE TABLE chat_session_pi_contexts (
  session_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL UNIQUE,
  adapter_name TEXT NOT NULL DEFAULT 'pi-agent-core',
  adapter_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (adapter_schema_version > 0),
  adapter_state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(adapter_state_json)),
  last_turn_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
CREATE TABLE chat_session_command_receipts (
  command_id TEXT PRIMARY KEY NOT NULL,
  request_fingerprint TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'recovery_required')),
  terminal_error_code TEXT,
  committed_sequence INTEGER NOT NULL CHECK (committed_sequence > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX chat_session_receipts_session ON chat_session_command_receipts(session_id)`;
});

export const addProjectGitObjectsIdentityMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE projects ADD COLUMN objects_dir_device_id TEXT`;
  yield* sql`ALTER TABLE projects ADD COLUMN objects_dir_file_id TEXT`;
  yield* sql`CREATE UNIQUE INDEX projects_objects_dir_identity ON projects(objects_dir_device_id, objects_dir_file_id)`;
});

export const createProjectSessionFollowUpsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE project_session_follow_ups (
  session_id TEXT NOT NULL,
  follow_up_id TEXT NOT NULL UNIQUE,
  command_id TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 16000),
  state TEXT NOT NULL CHECK (state IN ('queued', 'dispatched', 'consumed', 'cancelled', 'recovery_required')),
  position INTEGER NOT NULL CHECK (position > 0),
  dispatched_turn_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, follow_up_id),
  FOREIGN KEY (session_id) REFERENCES project_session_bindings(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX project_session_follow_ups_queue ON project_session_follow_ups(session_id, state, position)`;
});

export const createWorkspaceToolPolicyMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE workspace_tool_policies (
  tool_name TEXT PRIMARY KEY NOT NULL,
  confirmation TEXT NOT NULL CHECK (confirmation IN ('never', 'ask')),
  updated_at TEXT NOT NULL
)`;
});

export const createAgentRuntimeDefaultsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE agent_runtime_defaults (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  default_provider_id TEXT CHECK (default_provider_id IS NULL OR length(default_provider_id) BETWEEN 1 AND 128),
  default_model_id TEXT CHECK (default_model_id IS NULL OR length(default_model_id) BETWEEN 1 AND 256),
  default_thinking_level TEXT CHECK (default_thinking_level IS NULL OR default_thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  updated_at TEXT NOT NULL,
  CHECK ((default_provider_id IS NULL) = (default_model_id IS NULL))
)`;
});

export const addChatSessionReasoningPartsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE chat_session_messages ADD COLUMN content_parts_json TEXT CHECK (content_parts_json IS NULL OR json_valid(content_parts_json))`;
  yield* sql`ALTER TABLE chat_session_turns ADD COLUMN draft_parts_json TEXT CHECK (draft_parts_json IS NULL OR json_valid(draft_parts_json))`;
});

export const createGlobalChatSessionFollowUpsMigration = Effect.gen(
  function* () {
    const sql = yield* SqlClient;
    yield* sql`
CREATE TABLE global_chat_session_follow_ups (
  session_id TEXT NOT NULL,
  follow_up_id TEXT NOT NULL UNIQUE,
  command_id TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 16000),
  state TEXT NOT NULL CHECK (state IN ('queued', 'dispatched', 'consumed', 'cancelled', 'recovery_required')),
  position INTEGER NOT NULL CHECK (position > 0),
  dispatched_turn_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, follow_up_id),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
    yield* sql`CREATE INDEX global_chat_session_follow_ups_queue ON global_chat_session_follow_ups(session_id, state, position)`;
    yield* sql`
CREATE TRIGGER global_chat_session_follow_ups_require_global_kind
BEFORE INSERT ON global_chat_session_follow_ups
FOR EACH ROW
WHEN (SELECT kind FROM chat_sessions WHERE session_id = NEW.session_id) <> 'global'
BEGIN
  SELECT RAISE(ABORT, 'global_chat_follow_up_requires_global_chat_session');
END`;
  },
);

/**
 * Pre-release wipe policy (ADR 0044): databases below the current schema
 * version are destructively wiped before migrations run, so these migrations
 * never rewrite legacy rows; they only establish the final schema shape on a
 * freshly created database.
 */
export const addTurnAssistantMessageIdsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE chat_session_turns ADD COLUMN assistant_message_ids_json TEXT CHECK (assistant_message_ids_json IS NULL OR json_valid(assistant_message_ids_json))`;
});

export const addTurnDraftMessagesMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE chat_session_turns ADD COLUMN draft_messages_json TEXT CHECK (draft_messages_json IS NULL OR json_valid(draft_messages_json))`;
});

/**
 * No-op schema bump marking the pre-release required multi-message turn
 * shapes (ADR 0044). Databases recorded below this version are wiped and
 * recreated before migrations run; the migration exists so the required
 * version advances past the legacy backfill-era databases.
 */
export const markRequiredTurnShapesMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`SELECT 1`;
});

export const hostMigrationLoader: Migrator.Loader = Effect.succeed([
  [1, "create_project_catalog", Effect.succeed(createProjectCatalogMigration)],
  [2, "create_chat_sessions", Effect.succeed(createChatSessionsMigration)],
  [
    3,
    "add_project_git_objects_identity",
    Effect.succeed(addProjectGitObjectsIdentityMigration),
  ],
  [
    4,
    "create_project_session_follow_ups",
    Effect.succeed(createProjectSessionFollowUpsMigration),
  ],
  [
    5,
    "create_workspace_tool_policies",
    Effect.succeed(createWorkspaceToolPolicyMigration),
  ],
  [
    6,
    "create_agent_runtime_defaults",
    Effect.succeed(createAgentRuntimeDefaultsMigration),
  ],
  [
    7,
    "add_chat_session_reasoning_parts",
    Effect.succeed(addChatSessionReasoningPartsMigration),
  ],
  [
    8,
    "create_global_chat_session_follow_ups",
    Effect.succeed(createGlobalChatSessionFollowUpsMigration),
  ],
  [
    9,
    "add_turn_assistant_message_ids",
    Effect.succeed(addTurnAssistantMessageIdsMigration),
  ],
  [
    10,
    "add_turn_draft_messages",
    Effect.succeed(addTurnDraftMessagesMigration),
  ],
  [
    11,
    "mark_required_turn_shapes",
    Effect.succeed(markRequiredTurnShapesMigration),
  ],
] as const);

/**
 * Current required durable Host data schema version. Persisted databases
 * below this version are wiped and recreated at startup (ADR 0044).
 */
export const HOST_DATA_VERSION = 11;

export const projectCatalogMigrationLoader = hostMigrationLoader;
