import { asc, count, eq, isNotNull } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { SessionsRepository, StoredSession } from './sessions.service'

export function createSessionsRepository(): SessionsRepository {
  return {
    async listProjectSessions() {
      return (await getDatabase()
        .select()
        .from(schema.sessions)
        .where(isNotNull(schema.sessions.projectId))
        .orderBy(asc(schema.sessions.createdAt))) as StoredSession[]
    },

    async create(session) {
      await getDatabase().insert(schema.sessions).values(session)
      return session
    },

    async countByProjectId(projectId) {
      const [{ value }] = await getDatabase()
        .select({ value: count() })
        .from(schema.sessions)
        .where(eq(schema.sessions.projectId, projectId))

      return value
    },

    async projectExists(projectId) {
      const [project] = await getDatabase()
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1)

      return Boolean(project)
    }
  }
}
