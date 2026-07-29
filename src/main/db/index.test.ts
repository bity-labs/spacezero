import { describe, expect, it } from 'vitest'

import { migrateDatabase } from './index'

describe('database migrations', () => {
  it('migrates stable workspace Sessions into retained Chat Context history', () => {
    const statements: string[] = []
    const database = {
      exec(sql: string) {
        statements.push(sql)
      },
      prepare(sql: string) {
        return {
          all() {
            if (sql.includes('table_info(projects)')) return [{ name: 'id' }]
            return [{ name: 'id' }, { name: 'transcript_path' }]
          }
        }
      }
    } as unknown as Parameters<typeof migrateDatabase>[0]

    migrateDatabase(database)

    const migration = statements.join('\n')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS chat_contexts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS workspace_chat_contexts')
    expect(migration).toContain("WHERE managed_context = 'knowledge-base'")
    expect(migration).toContain("WHERE key = 'knowledgeBase.currentSessionId'")
    expect(migration).toContain('workspace_context_session_id IS NULL')
    expect(migration).toContain("'project-session'")
  })

  it('adds an optional stable GitHub repository association to existing Projects', () => {
    const statements: string[] = []
    const database = {
      exec(sql: string) {
        statements.push(sql)
      },
      prepare(sql: string) {
        return {
          all() {
            if (sql.includes('table_info(projects)')) {
              return [
                { name: 'id' },
                { name: 'name' },
                { name: 'path' },
                { name: 'created_at' },
                { name: 'updated_at' }
              ]
            }
            return [
              { name: 'id' },
              { name: 'project_id' },
              { name: 'title' },
              { name: 'status' },
              { name: 'created_at' },
              { name: 'updated_at' },
              { name: 'transcript_path' },
              { name: 'model_provider' },
              { name: 'model_id' },
              { name: 'thinking_level' },
              { name: 'archived_at' }
            ]
          }
        }
      }
    } as unknown as Parameters<typeof migrateDatabase>[0]

    migrateDatabase(database)

    expect(statements.join('\n')).toContain(
      'ALTER TABLE projects ADD COLUMN github_repository_id TEXT'
    )
    expect(statements.join('\n')).toContain(
      'ALTER TABLE projects ADD COLUMN github_repository_node_id TEXT'
    )
    expect(statements.join('\n')).toContain(
      'ALTER TABLE projects ADD COLUMN github_linked_at INTEGER'
    )
    expect(statements.join('\n')).toContain(
      'ALTER TABLE projects ADD COLUMN agent_resources_trusted INTEGER NOT NULL DEFAULT 0'
    )
    expect(statements.join('\n')).toContain('projects_github_repository_id_unique')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN worktree_path TEXT')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN source_type TEXT')
    expect(statements.join('\n')).toContain(
      'ALTER TABLE sessions ADD COLUMN source_repository_id TEXT'
    )
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN source_number INTEGER')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN managed_context TEXT')
    expect(statements.join('\n')).toContain(
      'ALTER TABLE sessions ADD COLUMN agent_definition_snapshot TEXT'
    )
    expect(statements.join('\n')).toContain(
      'ALTER TABLE sessions ADD COLUMN workspace_context_session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE'
    )
    expect(statements.join('\n')).toContain('CREATE TABLE IF NOT EXISTS terminal_tabs')
    expect(statements.join('\n')).toContain('CREATE TABLE IF NOT EXISTS browser_tabs')
    expect(statements.join('\n')).toContain('context_project_id TEXT')
    expect(statements.join('\n')).toContain('PRIMARY KEY (context_key, tab_id)')
  })
})
