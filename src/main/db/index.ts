import { app } from 'electron'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { count } from 'drizzle-orm'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'

import * as schema from './schema'

let sqlite: Database.Database | undefined
let orm: ReturnType<typeof drizzle<typeof schema>> | undefined
let dbPath: string | undefined

export function migrateDatabase(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      knowledge_base_path TEXT,
      github_repository_id TEXT,
      github_repository_node_id TEXT,
      github_owner TEXT,
      github_name TEXT,
      github_url TEXT,
      github_linked_at INTEGER,
      agent_resources_trusted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      transcript_path TEXT,
      model_provider TEXT,
      model_id TEXT,
      thinking_level TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      worktree_base_revision TEXT,
      source_type TEXT,
      source_repository_id TEXT,
      source_repository_node_id TEXT,
      source_repository_owner TEXT,
      source_repository_name TEXT,
      source_number INTEGER,
      source_url TEXT,
      source_title TEXT,
      archived_at INTEGER,
      managed_context TEXT,
      agent_definition_snapshot TEXT
    );

    CREATE TABLE IF NOT EXISTS terminal_tabs (
      context_key TEXT NOT NULL,
      context_kind TEXT NOT NULL,
      context_session_id TEXT,
      tab_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      active INTEGER NOT NULL,
      cwd TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (context_key, tab_id)
    );

    CREATE TABLE IF NOT EXISTS browser_tabs (
      context_key TEXT NOT NULL,
      context_kind TEXT NOT NULL,
      context_session_id TEXT,
      context_project_id TEXT,
      tab_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      active INTEGER NOT NULL,
      url TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (context_key, tab_id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  const projectColumns = database.prepare(`PRAGMA table_info(projects)`).all() as Array<{
    name: string
  }>
  const projectMigrations = [
    ['knowledge_base_path', 'TEXT'],
    ['github_repository_id', 'TEXT'],
    ['github_repository_node_id', 'TEXT'],
    ['github_owner', 'TEXT'],
    ['github_name', 'TEXT'],
    ['github_url', 'TEXT'],
    ['github_linked_at', 'INTEGER'],
    ['agent_resources_trusted', 'INTEGER NOT NULL DEFAULT 0'],
    ['archived_at', 'INTEGER']
  ] as const
  for (const [column, type] of projectMigrations) {
    if (!projectColumns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE projects ADD COLUMN ${column} ${type}`)
    }
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS projects_github_repository_id_unique
     ON projects(github_repository_id) WHERE github_repository_id IS NOT NULL`
  )

  const sessionColumns = database.prepare(`PRAGMA table_info(sessions)`).all() as Array<{
    name: string
  }>
  if (!sessionColumns.some((column) => column.name === 'transcript_path')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN transcript_path TEXT`)
  }
  if (!sessionColumns.some((column) => column.name === 'model_provider')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN model_provider TEXT`)
  }
  if (!sessionColumns.some((column) => column.name === 'model_id')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN model_id TEXT`)
  }
  if (!sessionColumns.some((column) => column.name === 'thinking_level')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN thinking_level TEXT`)
  }
  const sessionMigrations = [
    ['worktree_path', 'TEXT'],
    ['worktree_branch', 'TEXT'],
    ['worktree_base_revision', 'TEXT'],
    ['source_type', 'TEXT'],
    ['source_repository_id', 'TEXT'],
    ['source_repository_node_id', 'TEXT'],
    ['source_repository_owner', 'TEXT'],
    ['source_repository_name', 'TEXT'],
    ['source_number', 'INTEGER'],
    ['source_url', 'TEXT'],
    ['source_title', 'TEXT'],
    ['archived_at', 'INTEGER'],
    ['managed_context', 'TEXT'],
    ['agent_definition_snapshot', 'TEXT']
  ] as const
  for (const [column, type] of sessionMigrations) {
    if (!sessionColumns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE sessions ADD COLUMN ${column} ${type}`)
    }
  }
}

export function getDatabase() {
  if (orm) return orm

  dbPath = join(app.getPath('userData'), 'spacezero.sqlite3')
  mkdirSync(dirname(dbPath), { recursive: true })

  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrateDatabase(sqlite)

  orm = drizzle(sqlite, { schema })
  return orm
}

export async function getDatabaseHealth() {
  const db = getDatabase()
  const [{ value }] = await db.select({ value: count() }).from(schema.projects)

  return {
    ok: true,
    path: dbPath ?? '',
    projectCount: value
  }
}

export function closeDatabase(): void {
  sqlite?.close()
  sqlite = undefined
  orm = undefined
  dbPath = undefined
}
