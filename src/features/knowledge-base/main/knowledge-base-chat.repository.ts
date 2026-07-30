import { and, desc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { StoredSession } from '../../sessions/main/sessions.service'

export const KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY = 'knowledge-base'

export type StoredChatContext = {
  id: string
  workspaceContextKey: string
  agentSessionId: string
  createdAt: Date
  updatedAt: Date
}

export function createKnowledgeBaseChatRepository({
  createId = nanoid,
  now = () => new Date()
}: {
  createId?: () => string
  now?: () => Date
} = {}) {
  async function getCurrentChatContext(): Promise<StoredChatContext | undefined> {
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
          eq(
            schema.workspaceChatContexts.workspaceContextKey,
            KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY
          ),
          eq(schema.chatContexts.workspaceContextKey, KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY)
        )
      )
      .limit(1)
    return chatContext
  }

  async function findChatContextById(
    chatContextId: string
  ): Promise<StoredChatContext | undefined> {
    const [chatContext] = await getDatabase()
      .select({
        id: schema.chatContexts.id,
        workspaceContextKey: schema.chatContexts.workspaceContextKey,
        agentSessionId: schema.chatContexts.agentSessionId,
        createdAt: schema.chatContexts.createdAt,
        updatedAt: schema.chatContexts.updatedAt
      })
      .from(schema.chatContexts)
      .where(
        and(
          eq(schema.chatContexts.id, chatContextId),
          eq(schema.chatContexts.workspaceContextKey, KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY)
        )
      )
      .limit(1)
    return chatContext
  }

  return {
    getCurrentChatContext,
    findChatContextById,

    async listRecoverableAgentSessions(): Promise<StoredSession[]> {
      return (await getDatabase()
        .select()
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.managedContext, 'knowledge-base'),
            inArray(schema.sessions.agentLifecycleState, ['preparing', 'cleanup-pending'])
          )
        )) as StoredSession[]
    },

    async listAgentSessionsPendingCleanup(): Promise<StoredSession[]> {
      return (await getDatabase()
        .select()
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.managedContext, 'knowledge-base'),
            eq(schema.sessions.agentLifecycleState, 'cleanup-pending')
          )
        )) as StoredSession[]
    },

    async markAgentSessionPendingCleanup(sessionId: string): Promise<void> {
      getDatabase().transaction((transaction) => {
        const result = transaction
          .update(schema.sessions)
          .set({ agentLifecycleState: 'cleanup-pending' })
          .where(
            and(
              eq(schema.sessions.id, sessionId),
              eq(schema.sessions.managedContext, 'knowledge-base'),
              eq(schema.sessions.agentLifecycleState, 'active')
            )
          )
          .run()
        if (result.changes !== 1) {
          throw new Error('Knowledge Base Session is not eligible for superseded cleanup.')
        }
      })
    },

    async listChatContexts(): Promise<StoredChatContext[]> {
      return getDatabase()
        .select({
          id: schema.chatContexts.id,
          workspaceContextKey: schema.chatContexts.workspaceContextKey,
          agentSessionId: schema.chatContexts.agentSessionId,
          createdAt: schema.chatContexts.createdAt,
          updatedAt: schema.chatContexts.updatedAt
        })
        .from(schema.chatContexts)
        .where(eq(schema.chatContexts.workspaceContextKey, KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY))
        .orderBy(desc(schema.chatContexts.createdAt))
    },

    async createCurrentChatContext(agentSessionId: string): Promise<StoredChatContext> {
      const timestamp = now()
      const chatContext = createStoredChatContext(agentSessionId, createId(), timestamp)
      getDatabase().transaction((transaction) => {
        transaction.insert(schema.chatContexts).values(chatContext).run()
        transaction
          .insert(schema.workspaceChatContexts)
          .values({
            workspaceContextKey: KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
            workspaceContextKind: 'knowledge-base',
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

    async publishPreparedCurrentChatContext(
      preparedSession: StoredSession
    ): Promise<StoredChatContext> {
      const timestamp = now()
      const chatContext = createStoredChatContext(preparedSession.id, createId(), timestamp)
      getDatabase().transaction((transaction) => {
        const result = transaction
          .update(schema.sessions)
          .set({ ...preparedSession, agentLifecycleState: 'active' })
          .where(
            and(
              eq(schema.sessions.id, preparedSession.id),
              eq(schema.sessions.agentLifecycleState, 'preparing')
            )
          )
          .run()
        if (result.changes !== 1) {
          throw new Error('Knowledge Base Session reservation was not found.')
        }
        transaction.insert(schema.chatContexts).values(chatContext).run()
        transaction
          .insert(schema.workspaceChatContexts)
          .values({
            workspaceContextKey: KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
            workspaceContextKind: 'knowledge-base',
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

    async setCurrentChatContext(chatContextId: string): Promise<StoredChatContext> {
      const chatContext = await findChatContextById(chatContextId)
      if (!chatContext) throw new Error('Knowledge Base Chat Context was not found.')

      const timestamp = now()
      await getDatabase()
        .insert(schema.workspaceChatContexts)
        .values({
          workspaceContextKey: KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
          workspaceContextKind: 'knowledge-base',
          currentChatContextId: chatContext.id,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: schema.workspaceChatContexts.workspaceContextKey,
          set: { currentChatContextId: chatContext.id, updatedAt: timestamp }
        })
      return chatContext
    },

    async clearCurrentChatContext(): Promise<void> {
      await getDatabase()
        .delete(schema.workspaceChatContexts)
        .where(
          eq(schema.workspaceChatContexts.workspaceContextKey, KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY)
        )
    },

    async getCurrentSessionId(): Promise<string | undefined> {
      return (await getCurrentChatContext())?.agentSessionId
    }
  }
}

function createStoredChatContext(
  agentSessionId: string,
  id: string,
  timestamp: Date
): StoredChatContext {
  return {
    id,
    workspaceContextKey: KNOWLEDGE_BASE_WORKSPACE_CONTEXT_KEY,
    agentSessionId,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}
