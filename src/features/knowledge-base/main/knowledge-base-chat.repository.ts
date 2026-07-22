import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'

const CURRENT_SESSION_KEY = 'knowledgeBase.currentSessionId'

export function createKnowledgeBaseChatRepository() {
  return {
    async getCurrentSessionId(): Promise<string | undefined> {
      const [setting] = await getDatabase()
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, CURRENT_SESSION_KEY))
        .limit(1)
      return setting?.value || undefined
    },
    async setCurrentSessionId(sessionId: string): Promise<void> {
      await getDatabase()
        .insert(schema.appSettings)
        .values({ key: CURRENT_SESSION_KEY, value: sessionId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value: sessionId, updatedAt: new Date() }
        })
    },
    async clearCurrentSessionId(): Promise<void> {
      await getDatabase()
        .delete(schema.appSettings)
        .where(eq(schema.appSettings.key, CURRENT_SESSION_KEY))
    }
  }
}
