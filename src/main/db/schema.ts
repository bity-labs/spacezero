import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  knowledgeBasePath: text('knowledge_base_path'),
  githubRepositoryId: text('github_repository_id'),
  githubRepositoryNodeId: text('github_repository_node_id'),
  githubOwner: text('github_owner'),
  githubName: text('github_name'),
  githubUrl: text('github_url'),
  githubLinkedAt: integer('github_linked_at', { mode: 'timestamp_ms' }),
  agentResourcesTrusted: integer('agent_resources_trusted', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  title: text('title').notNull(),
  status: text('status', { enum: ['idle', 'running', 'completed', 'failed'] })
    .notNull()
    .default('idle'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  transcriptPath: text('transcript_path'),
  modelProvider: text('model_provider'),
  modelId: text('model_id'),
  thinkingLevel: text('thinking_level', {
    enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  }),
  worktreePath: text('worktree_path'),
  worktreeBranch: text('worktree_branch'),
  worktreeBaseRevision: text('worktree_base_revision'),
  sourceType: text('source_type', { enum: ['issue', 'pull-request'] }),
  sourceRepositoryId: text('source_repository_id'),
  sourceRepositoryNodeId: text('source_repository_node_id'),
  sourceRepositoryOwner: text('source_repository_owner'),
  sourceRepositoryName: text('source_repository_name'),
  sourceNumber: integer('source_number'),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  managedContext: text('managed_context', { enum: ['knowledge-base', 'global-chat'] }),
  workspaceContextSessionId: text('workspace_context_session_id').references(
    (): AnySQLiteColumn => sessions.id,
    { onDelete: 'cascade' }
  ),
  agentDefinitionSnapshot: text('agent_definition_snapshot'),
  agentLifecycleState: text('agent_lifecycle_state', {
    enum: ['preparing', 'active', 'cleanup-pending']
  })
    .notNull()
    .default('active')
})

export const chatContexts = sqliteTable('chat_contexts', {
  id: text('id').primaryKey(),
  workspaceContextKey: text('workspace_context_key').notNull(),
  agentSessionId: text('agent_session_id')
    .notNull()
    .unique()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const workspaceChatContexts = sqliteTable('workspace_chat_contexts', {
  workspaceContextKey: text('workspace_context_key').primaryKey(),
  workspaceContextKind: text('workspace_context_kind', {
    enum: ['knowledge-base', 'project-session', 'global-chat']
  }).notNull(),
  currentChatContextId: text('current_chat_context_id')
    .notNull()
    .references(() => chatContexts.id, { onDelete: 'cascade' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export const terminalTabs = sqliteTable(
  'terminal_tabs',
  {
    contextKey: text('context_key').notNull(),
    contextKind: text('context_kind', {
      enum: ['project-home', 'project-session', 'workspace-session', 'global-chat', 'knowledge-base']
    }).notNull(),
    contextSessionId: text('context_session_id'),
    tabId: text('tab_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    title: text('title').notNull(),
    active: integer('active').notNull(),
    cwd: text('cwd').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [primaryKey({ columns: [table.contextKey, table.tabId] })]
)

export const browserTabs = sqliteTable(
  'browser_tabs',
  {
    contextKey: text('context_key').notNull(),
    contextKind: text('context_kind', {
      enum: ['project-home', 'project-session', 'workspace-session', 'global-chat', 'knowledge-base']
    }).notNull(),
    contextSessionId: text('context_session_id'),
    contextProjectId: text('context_project_id'),
    tabId: text('tab_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
    active: integer('active').notNull(),
    url: text('url'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => [primaryKey({ columns: [table.contextKey, table.tabId] })]
)

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})
