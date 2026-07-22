import { describe, expect, it } from 'vitest'

import { migrateDatabase } from './index'

describe('database migrations', () => {
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
    expect(statements.join('\n')).toContain('projects_github_repository_id_unique')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN worktree_path TEXT')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN source_type TEXT')
    expect(statements.join('\n')).toContain(
      'ALTER TABLE sessions ADD COLUMN source_repository_id TEXT'
    )
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN source_number INTEGER')
    expect(statements.join('\n')).toContain('ALTER TABLE sessions ADD COLUMN managed_context TEXT')
  })
})
