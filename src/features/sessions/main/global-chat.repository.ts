import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'

export const GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY = 'global-chat' as const

export type StoredGlobalChatContext = {
  id: string
  workspaceContextKey: string
  agentSessionId: string
  createdAt: Date
  updatedAt: Date
}

export function createGlobalChatRepository({
  createId = nanoid,
  now = () => new Date()
}: {
  createId?: () => string
  now?: () => Date
} = {}) {
  async function getCurrentChatContext(): Promise<StoredGlobalChatContext | undefined> {
    const [chatContext] = await getDatabase()
      .select({
        id: schema.chatContexts.id,
        workspaceContextKey: schema.chatContexts.workspaceContextKey,
        agentSessionId: schema.chatContexts.agentSessionId,
        createdAt: schema.chatContexts.createdAt,
        updatedAt: schema.chatContexts.updatedAt
      })
      .from(schema.workspaceChatContexts)
      .innerJoin(
        schema.chatContexts,
        eq(schema.workspaceChatContexts.currentChatContextId, schema.chatContexts.id)
      )
      .where(
        and(
          eq(schema.workspaceChatContexts.workspaceContextKey, GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY),
          eq(schema.workspaceChatContexts.workspaceContextKind, 'global-chat'),
          eq(schema.chatContexts.workspaceContextKey, GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY)
        )
      )
      .limit(1)
    return chatContext
  }

  return {
    getCurrentChatContext,

    async createCurrentChatContext(agentSessionId: string): Promise<StoredGlobalChatContext> {
      const timestamp = now()
      const chatContext: StoredGlobalChatContext = {
        id: createId(),
        workspaceContextKey: GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY,
        agentSessionId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      getDatabase().transaction((transaction) => {
        transaction.insert(schema.chatContexts).values(chatContext).run()
        transaction
          .insert(schema.workspaceChatContexts)
          .values({
            workspaceContextKey: GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY,
            workspaceContextKind: 'global-chat',
            currentChatContextId: chatContext.id,
            updatedAt: timestamp
          })
          .onConflictDoUpdate({
            target: schema.workspaceChatContexts.workspaceContextKey,
            set: { currentChatContextId: chatContext.id, updatedAt: timestamp }
          })
          .run()
      })
      return chatContext
    },

    async clearCurrentChatContext(): Promise<void> {
      await getDatabase()
        .delete(schema.workspaceChatContexts)
        .where(
          eq(schema.workspaceChatContexts.workspaceContextKey, GLOBAL_CHAT_WORKSPACE_CONTEXT_KEY)
        )
    }
  }
}
