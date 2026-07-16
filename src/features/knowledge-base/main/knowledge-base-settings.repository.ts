import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { KnowledgeBaseConfiguration } from '../shared/knowledge-base.model'
import type { KnowledgeBaseConfigurationRepository } from './knowledge-base.service'

const CONFIGURATION_KEY = 'knowledgeBase.configuration'

export function createKnowledgeBaseConfigurationRepository(): KnowledgeBaseConfigurationRepository {
  return {
    async get() {
      const [setting] = await getDatabase()
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, CONFIGURATION_KEY))
        .limit(1)

      if (!setting) return undefined
      return parseConfiguration(setting.value)
    },

    async save(configuration) {
      await getDatabase()
        .insert(schema.appSettings)
        .values({
          key: CONFIGURATION_KEY,
          value: JSON.stringify(configuration),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value: JSON.stringify(configuration), updatedAt: new Date() }
        })
    }
  }
}

function parseConfiguration(value: string): KnowledgeBaseConfiguration | undefined {
  try {
    const configuration = JSON.parse(value) as Partial<KnowledgeBaseConfiguration>
    if (
      typeof configuration.rootPath !== 'string' ||
      !configuration.rootPath ||
      typeof configuration.configuredAt !== 'string'
    ) {
      return undefined
    }
    return { rootPath: configuration.rootPath, configuredAt: configuration.configuredAt }
  } catch {
    return undefined
  }
}
