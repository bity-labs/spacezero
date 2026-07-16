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

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      knowledge_base_path TEXT,
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
      archived_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  const projectColumns = database.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
  if (!projectColumns.some((column) => column.name === 'archived_at')) {
    database.exec(`ALTER TABLE projects ADD COLUMN archived_at INTEGER`)
  }
  if (!projectColumns.some((column) => column.name === 'knowledge_base_path')) {
    database.exec(`ALTER TABLE projects ADD COLUMN knowledge_base_path TEXT`)
  }

  const sessionColumns = database.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>
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
  if (!sessionColumns.some((column) => column.name === 'archived_at')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN archived_at INTEGER`)
  }
}

export function getDatabase() {
  if (orm) return orm

  dbPath = join(app.getPath('userData'), 'spacezero.sqlite3')
  mkdirSync(dirname(dbPath), { recursive: true })

  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrate(sqlite)

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
