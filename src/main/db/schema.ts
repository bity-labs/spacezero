import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
    enum: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']
  }),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})
