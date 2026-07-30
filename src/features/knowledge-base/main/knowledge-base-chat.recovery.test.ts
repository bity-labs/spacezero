import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as schema from '../../../main/db/schema'

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn()
}))

vi.mock('../../../main/db', () => ({
  getDatabase: mocks.getDatabase
}))

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import {
  createKnowledgeBaseChatRepository,
  type StoredChatContext
} from './knowledge-base-chat.repository'
import { createKnowledgeBaseChatService } from './knowledge-base-chat.service'

const now = new Date('2026-07-30T12:00:00.000Z')

let sqlite: Database.Database
let sessions: SessionsRepository

beforeEach(() => {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      transcript_path TEXT,
      model_provider TEXT,
      model_id TEXT,
      thinking_level TEXT,
      worktree_path TEXT,
      worktree_branch TEXT,
      worktree_base_revision TEXT,
      source_type TEXT,
      source_repository_id TEXT,
      source_repository_node_id TEXT,
      source_repository_owner TEXT,
      source_repository_name TEXT,
      source_number INTEGER,
      source_url TEXT,
      source_title TEXT,
      archived_at INTEGER,
      managed_context TEXT,
      workspace_context_session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      agent_definition_snapshot TEXT,
      agent_lifecycle_state TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE chat_contexts (
      id TEXT PRIMARY KEY,
      workspace_context_key TEXT NOT NULL,
      agent_session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE workspace_chat_contexts (
      workspace_context_key TEXT PRIMARY KEY,
      workspace_context_kind TEXT NOT NULL,
      current_chat_context_id TEXT NOT NULL REFERENCES chat_contexts(id) ON DELETE CASCADE,
      updated_at INTEGER NOT NULL
    );
  `)
  mocks.getDatabase.mockReturnValue(drizzle(sqlite, { schema }))
  sessions = createSessionsRepository()
})

afterEach(() => {
  sqlite.close()
  vi.clearAllMocks()
})

describe.runIf(Boolean(process.versions.electron))(
  'Knowledge Base post-publication supersession recovery',
  () => {
    it('durably retries failed cleanup without exposing or deleting the current winner', async () => {
      const winnerSession = storedSession({ id: 'winner-session', agentLifecycleState: 'active' })
      const supersededSession = storedSession({
        id: 'superseded-session',
        agentLifecycleState: 'preparing'
      })
      await sessions.create(winnerSession)

      const chatRepository = createKnowledgeBaseChatRepository({
        createId: (() => {
          const ids = ['winner-context', 'superseded-context']
          return () => ids.shift() ?? 'unexpected-context'
        })(),
        now: () => now
      })
      const winnerContext = await chatRepository.createCurrentChatContext(winnerSession.id)

      const publicationCompleted = deferred<void>()
      const releasePublication = deferred<void>()
      const winnerLookupCompleted = deferred<void>()
      const initialCleanupFailure = new Error('initial utility cleanup failed')
      const deleteUtilitySession = vi.fn<(sessionId: string) => Promise<void>>(async () => {
        throw initialCleanupFailure
      })
      const firstService = createService({
        chatRepository,
        prepareSession: async () => {
          await sessions.create(supersededSession)
          return {
            session: supersededSession,
            activate: async () => supersededSession
          }
        },
        publishCurrentChatContext: async (session) => {
          const context = await chatRepository.publishPreparedCurrentChatContext(session)
          publicationCompleted.resolve(undefined)
          await releasePublication.promise
          return context
        },
        findChatContextById: async (chatContextId) => {
          const context = await chatRepository.findChatContextById(chatContextId)
          winnerLookupCompleted.resolve(undefined)
          return context
        },
        recoverPreparedSessions: () => recoverRecoverable(chatRepository, deleteUtilitySession),
        retryPendingCleanup: () => recoverPending(chatRepository, deleteUtilitySession),
        deleteSession: async (sessionId) => {
          await deleteUtilitySession(sessionId)
          await sessions.deleteById(sessionId)
        }
      })

      const clearing = firstService.clearChat()
      const clearingResult = clearing.catch((error: unknown) => error)
      await publicationCompleted.promise
      const resuming = firstService.resumeChatContext(winnerContext.id)
      await winnerLookupCompleted.promise
      releasePublication.resolve(undefined)

      await expect(resuming).resolves.toMatchObject({ id: winnerContext.id })
      await expect(clearingResult).resolves.toBe(initialCleanupFailure)
      await expect(sessions.findSessionById(supersededSession.id)).resolves.toMatchObject({
        agentLifecycleState: 'cleanup-pending'
      })
      await expect(chatRepository.getCurrentChatContext()).resolves.toMatchObject({
        id: winnerContext.id,
        agentSessionId: winnerSession.id
      })
      await expect(sessions.findSessionById(winnerSession.id)).resolves.toMatchObject({
        agentLifecycleState: 'active'
      })

      const repeatedCleanupFailure = new Error('restart utility cleanup still failing')
      deleteUtilitySession.mockImplementation(async () => {
        throw repeatedCleanupFailure
      })
      const restartedService = createService({
        chatRepository,
        prepareSession: async () => {
          throw new Error('Unexpected Session preparation')
        },
        recoverPreparedSessions: () => recoverRecoverable(chatRepository, deleteUtilitySession),
        retryPendingCleanup: () => recoverPending(chatRepository, deleteUtilitySession),
        deleteSession: async () => undefined
      })

      await expect(restartedService.listChatHistory()).rejects.toBe(repeatedCleanupFailure)
      await expect(sessions.findSessionById(supersededSession.id)).resolves.toMatchObject({
        agentLifecycleState: 'cleanup-pending'
      })
      await expect(chatRepository.getCurrentChatContext()).resolves.toMatchObject({
        id: winnerContext.id
      })

      deleteUtilitySession.mockImplementation(async () => undefined)
      await expect(restartedService.listChatHistory()).resolves.toEqual([])
      await expect(sessions.findSessionById(supersededSession.id)).resolves.toBeUndefined()
      await expect(
        chatRepository.findChatContextById('superseded-context')
      ).resolves.toBeUndefined()
      await expect(chatRepository.getCurrentChatContext()).resolves.toMatchObject({
        id: winnerContext.id,
        agentSessionId: winnerSession.id
      })
      expect(deleteUtilitySession).toHaveBeenCalledTimes(3)
    })
  }
)

function createService({
  chatRepository,
  prepareSession,
  publishCurrentChatContext = chatRepository.publishPreparedCurrentChatContext,
  findChatContextById = chatRepository.findChatContextById,
  recoverPreparedSessions,
  retryPendingCleanup,
  deleteSession
}: {
  chatRepository: ReturnType<typeof createKnowledgeBaseChatRepository>
  prepareSession: () => Promise<{ session: StoredSession; activate: () => Promise<StoredSession> }>
  publishCurrentChatContext?: (session: StoredSession) => Promise<StoredChatContext>
  findChatContextById?: (chatContextId: string) => Promise<StoredChatContext | undefined>
  recoverPreparedSessions: () => Promise<void>
  retryPendingCleanup: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
}) {
  return createKnowledgeBaseChatService({
    getStatus: async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    }),
    getCurrentChatContext: chatRepository.getCurrentChatContext,
    listChatContexts: chatRepository.listChatContexts,
    findChatContextById,
    createCurrentChatContext: chatRepository.createCurrentChatContext,
    setCurrentChatContext: chatRepository.setCurrentChatContext,
    clearCurrentChatContext: chatRepository.clearCurrentChatContext,
    findSessionById: sessions.findSessionById,
    getSessionState: async ({ sessionId }) => ({
      sessionId,
      kind: 'workspace',
      projectId: null,
      cwd: '/home/builder/SpaceZero/knowledge-base',
      status: 'idle',
      live: false,
      transcriptPath: `/tmp/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot: []
    }),
    createSession: async () => {
      throw new Error('Unexpected legacy Session creation')
    },
    prepareSession,
    publishCurrentChatContext,
    recoverPreparedSessions,
    retryPendingCleanup,
    markSessionPendingCleanup: chatRepository.markAgentSessionPendingCleanup,
    deleteSession
  })
}

async function recoverRecoverable(
  chatRepository: ReturnType<typeof createKnowledgeBaseChatRepository>,
  deleteUtilitySession: (sessionId: string) => Promise<void>
): Promise<void> {
  await recoverSessions(chatRepository.listRecoverableAgentSessions, deleteUtilitySession)
}

async function recoverPending(
  chatRepository: ReturnType<typeof createKnowledgeBaseChatRepository>,
  deleteUtilitySession: (sessionId: string) => Promise<void>
): Promise<void> {
  await recoverSessions(chatRepository.listAgentSessionsPendingCleanup, deleteUtilitySession)
}

async function recoverSessions(
  listSessions: () => Promise<Array<{ id: string }>>,
  deleteUtilitySession: (sessionId: string) => Promise<void>
): Promise<void> {
  for (const session of await listSessions()) {
    await deleteUtilitySession(session.id)
    await sessions.deleteById(session.id)
  }
}

function storedSession(overrides: Partial<StoredSession>): StoredSession {
  return {
    id: 'session',
    projectId: null,
    managedContext: 'knowledge-base',
    title: 'Knowledge Base Chat',
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    ...overrides
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
