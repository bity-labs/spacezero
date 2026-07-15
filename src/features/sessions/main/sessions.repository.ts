import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { SessionsRepository, StoredSession } from './sessions.service'

export function createSessionsRepository(): SessionsRepository {
  return {
    async listProjectSessions() {
      return (await getDatabase()
        .select()
        .from(schema.sessions)
        .where(and(isNotNull(schema.sessions.projectId), isNull(schema.sessions.archivedAt)))
        .orderBy(asc(schema.sessions.createdAt))) as StoredSession[]
    },

    async listWorkspaceSessions() {
      return (await getDatabase()
        .select()
        .from(schema.sessions)
        .where(and(isNull(schema.sessions.projectId), isNull(schema.sessions.archivedAt)))
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
        .where(and(eq(schema.sessions.projectId, projectId), isNull(schema.sessions.archivedAt)))

      return value
    },

    async countWorkspaceSessions() {
      const [{ value }] = await getDatabase()
        .select({ value: count() })
        .from(schema.sessions)
        .where(and(isNull(schema.sessions.projectId), isNull(schema.sessions.archivedAt)))

      return value
    },

    async projectExists(projectId) {
      const [project] = await getDatabase()
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1)

      return Boolean(project)
    },

    async findProjectById(projectId) {
      const [project] = await getDatabase()
        .select({ id: schema.projects.id, path: schema.projects.path })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1)

      return project
    },

    async findSessionById(sessionId) {
      const [session] = await getDatabase()
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .limit(1)

      return session as StoredSession | undefined
    },

    async update(session) {
      await getDatabase().update(schema.sessions).set(session).where(eq(schema.sessions.id, session.id))
      return session
    },

    async deleteById(sessionId) {
      await getDatabase().delete(schema.sessions).where(eq(schema.sessions.id, sessionId))
    }
  }
}
