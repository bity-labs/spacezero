import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'

export type StoredProjectSessionChatContext = {
  id: string
  workspaceContextKey: string
  agentSessionId: string
  createdAt: Date
  updatedAt: Date
}

export function createProjectSessionChatRepository({
  createId = nanoid,
  now = () => new Date()
}: {
  createId?: () => string
  now?: () => Date
} = {}) {
  async function findChatContextById(
    projectSessionId: string,
    chatContextId: string
  ): Promise<StoredProjectSessionChatContext | undefined> {
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
          eq(schema.chatContexts.workspaceContextKey, projectSessionId)
        )
      )
      .limit(1)
    return chatContext
  }

  return {
    findChatContextById,

    async getCurrentChatContext(
      projectSessionId: string
    ): Promise<StoredProjectSessionChatContext | undefined> {
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
            eq(schema.workspaceChatContexts.workspaceContextKey, projectSessionId),
            eq(schema.workspaceChatContexts.workspaceContextKind, 'project-session'),
            eq(schema.chatContexts.workspaceContextKey, projectSessionId)
          )
        )
        .limit(1)
      return chatContext
    },

    async listChatContexts(projectSessionId: string): Promise<StoredProjectSessionChatContext[]> {
      return getDatabase()
        .select({
          id: schema.chatContexts.id,
          workspaceContextKey: schema.chatContexts.workspaceContextKey,
          agentSessionId: schema.chatContexts.agentSessionId,
          createdAt: schema.chatContexts.createdAt,
          updatedAt: schema.chatContexts.updatedAt
        })
        .from(schema.chatContexts)
        .where(eq(schema.chatContexts.workspaceContextKey, projectSessionId))
        .orderBy(desc(schema.chatContexts.createdAt))
    },

    async createCurrentChatContext(
      projectSessionId: string,
      agentSessionId: string
    ): Promise<StoredProjectSessionChatContext> {
      const timestamp = now()
      const chatContext: StoredProjectSessionChatContext = {
        id: createId(),
        workspaceContextKey: projectSessionId,
        agentSessionId,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      getDatabase().transaction((transaction) => {
        transaction.insert(schema.chatContexts).values(chatContext).run()
        transaction
          .insert(schema.workspaceChatContexts)
          .values({
            workspaceContextKey: projectSessionId,
            workspaceContextKind: 'project-session',
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

    async setCurrentChatContext(
      projectSessionId: string,
      chatContextId: string
    ): Promise<StoredProjectSessionChatContext> {
      const chatContext = await findChatContextById(projectSessionId, chatContextId)
      if (!chatContext) throw new Error('Project Session Chat Context was not found')

      const timestamp = now()
      await getDatabase()
        .insert(schema.workspaceChatContexts)
        .values({
          workspaceContextKey: projectSessionId,
          workspaceContextKind: 'project-session',
          currentChatContextId: chatContext.id,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: schema.workspaceChatContexts.workspaceContextKey,
          set: { currentChatContextId: chatContext.id, updatedAt: timestamp }
        })
      return chatContext
    }
  }
}
