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

export const createProjectSessionTurnsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE project_session_turns (
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'interrupted', 'recovery_required')),
  draft_text TEXT NOT NULL DEFAULT '',
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id),
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX project_session_turns_state ON project_session_turns(session_id, state)`;
  yield* sql`
INSERT INTO project_session_turns (
  session_id,
  turn_id,
  command_id,
  user_message_id,
  assistant_message_id,
  state,
  draft_text,
  failure_reason,
  created_at,
  updated_at
)
SELECT
  receipt.session_id,
  json_extract(turn_event.event_payload_json, '$.turnId'),
  receipt.command_id,
  json_extract(user_event.event_payload_json, '$.messageId'),
  COALESCE(
    assistant_message.message_id,
    CASE
      WHEN json_extract(turn_event.event_payload_json, '$.messageId') != json_extract(user_event.event_payload_json, '$.messageId')
      THEN json_extract(turn_event.event_payload_json, '$.messageId')
      ELSE lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))
    END
  ),
  CASE receipt.status
    WHEN 'succeeded' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    ELSE 'recovery_required'
  END,
  COALESCE(assistant_message.text, ''),
  CASE
    WHEN receipt.status IN ('failed', 'recovery_required') THEN receipt.terminal_error_code
    WHEN receipt.status = 'pending' THEN 'session_recovery_required'
    ELSE NULL
  END,
  receipt.created_at,
  receipt.updated_at
FROM project_session_command_receipts receipt
JOIN project_session_events user_event
  ON user_event.session_id = receipt.session_id
  AND user_event.event_type = 'UserMessageSubmittedV1'
  AND json_extract(user_event.event_payload_json, '$.commandId') = receipt.command_id
JOIN project_session_events turn_event
  ON turn_event.session_id = receipt.session_id
  AND turn_event.event_type = 'AgentTurnStartedV1'
  AND turn_event.sequence = (
    SELECT min(candidate.sequence)
    FROM project_session_events candidate
    WHERE candidate.session_id = receipt.session_id
      AND candidate.event_type = 'AgentTurnStartedV1'
      AND candidate.sequence > user_event.sequence
  )
LEFT JOIN project_session_messages assistant_message
  ON assistant_message.session_id = receipt.session_id
  AND assistant_message.turn_id = json_extract(turn_event.event_payload_json, '$.turnId')
  AND assistant_message.role = 'assistant'
WHERE NOT EXISTS (
  SELECT 1
  FROM project_session_turns existing
  WHERE existing.command_id = receipt.command_id
)`;
});

export const addProjectGitObjectsIdentityMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE projects ADD COLUMN objects_dir_device_id TEXT`;
  yield* sql`ALTER TABLE projects ADD COLUMN objects_dir_file_id TEXT`;
  yield* sql`CREATE UNIQUE INDEX projects_objects_dir_identity ON projects(objects_dir_device_id, objects_dir_file_id)`;
});

export const createProjectSessionRuntimeMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE project_session_runtime_configurations (
  session_id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 128),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 256),
  default_thinking_level TEXT NOT NULL CHECK (default_thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
INSERT INTO project_session_runtime_configurations (session_id, provider_id, model_id, default_thinking_level, revision, created_at, updated_at)
SELECT session_id, 'anthropic', 'claude-sonnet-4-5', 'off', 1, created_at, updated_at
FROM project_sessions`;
  yield* sql`
INSERT INTO project_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at)
SELECT
  session_id,
  last_sequence + 1,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  'ProjectSessionRuntimeConfiguredV1',
  1,
  json_object(
    'type', 'ProjectSessionRuntimeConfiguredV1',
    'version', 1,
    'sessionId', session_id,
    'commandId', session_id,
    'providerId', 'anthropic',
    'modelId', 'claude-sonnet-4-5',
    'defaultThinkingLevel', 'off',
    'revision', 1,
    'timestamp', updated_at
  ),
  updated_at
FROM project_sessions`;
  yield* sql`UPDATE project_sessions SET last_sequence = last_sequence + 1`;
  yield* sql`ALTER TABLE project_session_turns ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'anthropic'`;
  yield* sql`ALTER TABLE project_session_turns ADD COLUMN model_id TEXT NOT NULL DEFAULT 'claude-sonnet-4-5'`;
  yield* sql`ALTER TABLE project_session_turns ADD COLUMN thinking_level TEXT NOT NULL DEFAULT 'off'`;
  yield* sql`
UPDATE project_session_events
SET event_payload_json = json_set(
  event_payload_json,
  '$.providerId', 'anthropic',
  '$.modelId', 'claude-sonnet-4-5',
  '$.thinkingLevel', 'off'
)
WHERE event_type = 'AgentTurnStartedV1'
  AND json_type(event_payload_json, '$.providerId') IS NULL`;
  yield* sql`
UPDATE project_session_events
SET event_payload_json = json_set(
  event_payload_json,
  '$.failureCategory', 'provider',
  '$.retryable', json('false')
)
WHERE event_type = 'AgentTurnFailedV1'
  AND json_type(event_payload_json, '$.failureCategory') IS NULL`;
});

export const createProjectSessionPiContextsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE project_session_pi_contexts (
  session_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
INSERT INTO project_session_pi_contexts (session_id, conversation_id, created_at, updated_at)
SELECT
  session_id,
  session_id,
  created_at,
  updated_at
FROM project_sessions`;
});

export const enrichProjectSessionPiContextsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE project_session_pi_contexts ADD COLUMN adapter_name TEXT NOT NULL DEFAULT 'pi-agent-core'`;
  yield* sql`ALTER TABLE project_session_pi_contexts ADD COLUMN adapter_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (adapter_schema_version > 0)`;
  yield* sql`ALTER TABLE project_session_pi_contexts ADD COLUMN adapter_state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(adapter_state_json))`;
  yield* sql`ALTER TABLE project_session_pi_contexts ADD COLUMN last_turn_id TEXT`;
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
  FOREIGN KEY (session_id) REFERENCES project_sessions(session_id)
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

export const createGlobalChatSessionsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`
CREATE TABLE global_chat_session_events (
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
CREATE TABLE global_chat_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60 AND instr(title, char(10)) = 0 AND instr(title, char(13)) = 0),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence > 0)
)`;
  yield* sql`
CREATE TABLE global_chat_messages (
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, sequence),
  FOREIGN KEY (session_id) REFERENCES global_chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
CREATE TABLE global_chat_session_command_receipts (
  command_id TEXT PRIMARY KEY NOT NULL,
  request_fingerprint TEXT NOT NULL,
  session_id TEXT NOT NULL,
  committed_sequence INTEGER NOT NULL CHECK (committed_sequence > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES global_chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX global_chat_sessions_updated_order ON global_chat_sessions(archived_at, updated_at, session_id)`;
  yield* sql`CREATE INDEX global_chat_messages_list_order ON global_chat_messages(session_id, sequence)`;
});

export const addGlobalChatSessionTurnsMigration = Effect.gen(function* () {
  const sql = yield* SqlClient;
  yield* sql`ALTER TABLE global_chat_messages ADD COLUMN turn_id TEXT`;
  yield* sql`ALTER TABLE global_chat_session_command_receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'recovery_required'))`;
  yield* sql`ALTER TABLE global_chat_session_command_receipts ADD COLUMN terminal_error_code TEXT`;
  yield* sql`
CREATE TABLE global_chat_session_turns (
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  command_id TEXT NOT NULL UNIQUE,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  thinking_level TEXT NOT NULL CHECK (thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'interrupted', 'recovery_required')),
  draft_text TEXT NOT NULL DEFAULT '',
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_id),
  FOREIGN KEY (session_id) REFERENCES global_chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`CREATE INDEX global_chat_session_turns_state ON global_chat_session_turns(session_id, state)`;
  yield* sql`
CREATE TABLE global_chat_session_runtime_configurations (
  session_id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 128),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 256),
  default_thinking_level TEXT NOT NULL CHECK (default_thinking_level IN ('off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES global_chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
INSERT INTO global_chat_session_runtime_configurations (session_id, provider_id, model_id, default_thinking_level, revision, created_at, updated_at)
SELECT session_id, 'anthropic', 'claude-sonnet-4-5', 'off', 1, created_at, updated_at
FROM global_chat_sessions`;
  yield* sql`
CREATE TABLE global_chat_session_pi_contexts (
  session_id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL UNIQUE,
  adapter_name TEXT NOT NULL DEFAULT 'pi-agent-core',
  adapter_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (adapter_schema_version > 0),
  adapter_state_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(adapter_state_json)),
  last_turn_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES global_chat_sessions(session_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
)`;
  yield* sql`
INSERT INTO global_chat_session_pi_contexts (session_id, conversation_id, created_at, updated_at)
SELECT session_id, session_id, created_at, updated_at
FROM global_chat_sessions`;
  yield* sql`
INSERT INTO global_chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at)
SELECT
  session_id,
  last_sequence + 1,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  'GlobalChatSessionRuntimeConfiguredV1',
  1,
  json_object(
    'type', 'GlobalChatSessionRuntimeConfiguredV1',
    'version', 1,
    'sessionId', session_id,
    'commandId', session_id,
    'providerId', 'anthropic',
    'modelId', 'claude-sonnet-4-5',
    'defaultThinkingLevel', 'off',
    'revision', 1,
    'timestamp', updated_at
  ),
  updated_at
FROM global_chat_sessions`;
  yield* sql`UPDATE global_chat_sessions SET last_sequence = last_sequence + 1`;
  yield* sql`
INSERT INTO global_chat_session_turns (
  session_id,
  turn_id,
  command_id,
  user_message_id,
  assistant_message_id,
  provider_id,
  model_id,
  thinking_level,
  state,
  draft_text,
  failure_reason,
  created_at,
  updated_at
)
SELECT
  receipt.session_id,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  receipt.command_id,
  message.message_id,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  'anthropic',
  'claude-sonnet-4-5',
  'off',
  'recovery_required',
  '',
  'global_chat_session_recovery_required',
  receipt.created_at,
  receipt.updated_at
FROM global_chat_session_command_receipts receipt
JOIN global_chat_messages message
  ON message.session_id = receipt.session_id
  AND message.role = 'user'
  AND message.sequence = (
    SELECT min(candidate.sequence)
    FROM global_chat_messages candidate
    WHERE candidate.session_id = receipt.session_id
      AND candidate.role = 'user'
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM global_chat_session_turns existing
  WHERE existing.command_id = receipt.command_id
)`;
  yield* sql`
UPDATE global_chat_messages
SET turn_id = (
  SELECT turn.turn_id
  FROM global_chat_session_turns turn
  JOIN global_chat_session_command_receipts receipt
    ON receipt.command_id = turn.command_id
  WHERE receipt.session_id = global_chat_messages.session_id
    AND turn.user_message_id = global_chat_messages.message_id
)
WHERE turn_id IS NULL`;
  yield* sql`
INSERT INTO global_chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at)
SELECT
  session.session_id,
  session.last_sequence + 1,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  'GlobalChatAgentTurnStartedV1',
  1,
  json_object(
    'type', 'GlobalChatAgentTurnStartedV1',
    'version', 1,
    'sessionId', session.session_id,
    'turnId', turn.turn_id,
    'messageId', turn.assistant_message_id,
    'providerId', turn.provider_id,
    'modelId', turn.model_id,
    'thinkingLevel', turn.thinking_level,
    'timestamp', session.updated_at
  ),
  session.updated_at
FROM global_chat_sessions session
JOIN global_chat_session_turns turn
  ON turn.session_id = session.session_id
  AND turn.state = 'recovery_required'
  AND turn.failure_reason = 'global_chat_session_recovery_required'
WHERE NOT EXISTS (
  SELECT 1
  FROM global_chat_session_events existing
  WHERE existing.session_id = session.session_id
    AND existing.event_type = 'GlobalChatAgentTurnStartedV1'
    AND json_extract(existing.event_payload_json, '$.turnId') = turn.turn_id
)`;
  yield* sql`
UPDATE global_chat_sessions
SET last_sequence = last_sequence + 1
WHERE EXISTS (
  SELECT 1
  FROM global_chat_session_turns turn
  WHERE turn.session_id = global_chat_sessions.session_id
    AND turn.state = 'recovery_required'
    AND turn.failure_reason = 'global_chat_session_recovery_required'
)`;
  yield* sql`
INSERT INTO global_chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at)
SELECT
  session.session_id,
  session.last_sequence + 1,
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
  'GlobalChatAgentTurnFailedV1',
  1,
  json_object(
    'type', 'GlobalChatAgentTurnFailedV1',
    'version', 1,
    'sessionId', session.session_id,
    'turnId', turn.turn_id,
    'reason', 'global_chat_session_recovery_required',
    'failureCategory', 'system',
    'retryable', json('false'),
    'timestamp', session.updated_at
  ),
  session.updated_at
FROM global_chat_sessions session
JOIN global_chat_session_turns turn
  ON turn.session_id = session.session_id
  AND turn.state = 'recovery_required'
  AND turn.failure_reason = 'global_chat_session_recovery_required'
WHERE NOT EXISTS (
  SELECT 1
  FROM global_chat_session_events existing
  WHERE existing.session_id = session.session_id
    AND existing.event_type = 'GlobalChatAgentTurnFailedV1'
    AND json_extract(existing.event_payload_json, '$.turnId') = turn.turn_id
)`;
  yield* sql`
UPDATE global_chat_sessions
SET last_sequence = last_sequence + 1
WHERE EXISTS (
  SELECT 1
  FROM global_chat_session_turns turn
  WHERE turn.session_id = global_chat_sessions.session_id
    AND turn.state = 'recovery_required'
    AND turn.failure_reason = 'global_chat_session_recovery_required'
)`;
  yield* sql`
UPDATE global_chat_session_command_receipts
SET
  status = 'recovery_required',
  terminal_error_code = 'global_chat_session_recovery_required',
  committed_sequence = (
    SELECT session.last_sequence
    FROM global_chat_sessions session
    WHERE session.session_id = global_chat_session_command_receipts.session_id
  ),
  updated_at = (
    SELECT session.updated_at
    FROM global_chat_sessions session
    WHERE session.session_id = global_chat_session_command_receipts.session_id
  )
WHERE EXISTS (
  SELECT 1
  FROM global_chat_session_turns turn
  WHERE turn.command_id = global_chat_session_command_receipts.command_id
    AND turn.state = 'recovery_required'
    AND turn.failure_reason = 'global_chat_session_recovery_required'
)`;
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
  [
    4,
    "create_project_session_pi_contexts",
    Effect.succeed(createProjectSessionPiContextsMigration),
  ],
  [
    5,
    "add_project_git_objects_identity",
    Effect.succeed(addProjectGitObjectsIdentityMigration),
  ],
  [
    6,
    "create_project_session_turns",
    Effect.succeed(createProjectSessionTurnsMigration),
  ],
  [
    7,
    "create_project_session_runtime_configurations",
    Effect.succeed(createProjectSessionRuntimeMigration),
  ],
  [
    8,
    "enrich_project_session_pi_contexts",
    Effect.succeed(enrichProjectSessionPiContextsMigration),
  ],
  [
    9,
    "create_project_session_follow_ups",
    Effect.succeed(createProjectSessionFollowUpsMigration),
  ],
  [
    10,
    "create_workspace_tool_policies",
    Effect.succeed(createWorkspaceToolPolicyMigration),
  ],
  [
    11,
    "create_global_chat_sessions",
    Effect.succeed(createGlobalChatSessionsMigration),
  ],
  [
    12,
    "add_global_chat_session_turns",
    Effect.succeed(addGlobalChatSessionTurnsMigration),
  ],
] as const);

export const projectCatalogMigrationLoader = hostMigrationLoader;
