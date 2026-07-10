import { asc, eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { ProjectsRepository, StoredProject } from './projects.service'

export function createProjectsRepository(): ProjectsRepository {
  return {
    async list() {
      return await getDatabase().select().from(schema.projects).orderBy(asc(schema.projects.name))
    },

    async create(project) {
      await getDatabase().insert(schema.projects).values(project)
      return project
    },

    async update(project) {
      await getDatabase()
        .update(schema.projects)
        .set({ name: project.name, path: project.path, updatedAt: project.updatedAt })
        .where(eq(schema.projects.id, project.id))
      return project
    },

    async findById(id) {
      const [project] = await getDatabase()
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, id))
        .limit(1)

      return project as StoredProject | undefined
    }
  }
}
