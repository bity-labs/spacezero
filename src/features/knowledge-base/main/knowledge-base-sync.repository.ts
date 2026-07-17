import { eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type {
  KnowledgeBaseSyncStateRepository,
  StoredKnowledgeBaseSyncState
} from './knowledge-base-sync.service'

const SYNC_STATE_KEY = 'knowledgeBase.syncState'

export function createKnowledgeBaseSyncStateRepository(): KnowledgeBaseSyncStateRepository {
  return {
    async get() {
      const [setting] = await getDatabase()
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, SYNC_STATE_KEY))
        .limit(1)
      return setting ? parseSyncState(setting.value) : undefined
    },

    async save(state) {
      const value = JSON.stringify(state)
      const updatedAt = new Date()
      await getDatabase()
        .insert(schema.appSettings)
        .values({ key: SYNC_STATE_KEY, value, updatedAt })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { value, updatedAt }
        })
    },

    async clear() {
      await getDatabase()
        .delete(schema.appSettings)
        .where(eq(schema.appSettings.key, SYNC_STATE_KEY))
    }
  }
}

function parseSyncState(value: string): StoredKnowledgeBaseSyncState | undefined {
  try {
    const state = JSON.parse(value) as Partial<StoredKnowledgeBaseSyncState>
    if (!['idle', 'syncing', 'error', 'conflict'].includes(state.syncState ?? '')) {
      return undefined
    }
    return {
      syncState: state.syncState as StoredKnowledgeBaseSyncState['syncState'],
      lastSyncAt: typeof state.lastSyncAt === 'string' ? state.lastSyncAt : undefined,
      lastSyncError: typeof state.lastSyncError === 'string' ? state.lastSyncError : undefined
    }
  } catch {
    return undefined
  }
}
