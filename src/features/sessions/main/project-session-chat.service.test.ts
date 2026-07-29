import { describe, expect, it, vi } from 'vitest'

import type { StoredSession } from './sessions.service'
import type { StoredProjectSessionChatContext } from './project-session-chat.repository'
import { createProjectSessionChatService } from './project-session-chat.service'

const timestamp = new Date('2026-07-30T12:00:00.000Z')

function projectSession(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'project-session-1',
    projectId: 'project-1',
    title: 'Fix the issue',
    status: 'idle',
    createdAt: timestamp,
    updatedAt: timestamp,
    transcriptPath: '/transcripts/project-session-1.jsonl',
    worktreePath: '/worktrees/project-1/project-session-1',
    worktreeBranch: 'spacezero/issue-360-project-session-1',
    worktreeBaseRevision: 'abc123',
    sourceType: 'issue',
    sourceRepositoryId: 'repo-1',
    sourceRepositoryNodeId: 'R_repo1',
    sourceRepositoryOwner: 'bity-labs',
    sourceRepositoryName: 'spacezero',
    sourceNumber: 360,
    sourceUrl: 'https://github.com/bity-labs/spacezero/issues/360',
    sourceTitle: 'Project Sessions support /clear',
    ...overrides
  }
}

function chatContext(
  id: string,
  agentSessionId: string,
  projectSessionId = 'project-session-1'
): StoredProjectSessionChatContext {
  return {
    id,
    workspaceContextKey: projectSessionId,
    agentSessionId,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

describe('Project Session Chat Contexts', () => {
  it('persists the existing Project Session agent as its initial current Chat Context', async () => {
    const stableSession = projectSession()
    const createCurrentChatContext = vi.fn(
      async (projectSessionId: string, agentSessionId: string) =>
        chatContext('chat-context-1', agentSessionId, projectSessionId)
    )
    const createFreshAgentSession = vi.fn()
    const service = createProjectSessionChatService({
      findSessionById: async () => stableSession,
      getCurrentChatContext: async () => undefined,
      createCurrentChatContext,
      createFreshAgentSession,
      deleteAgentSession: vi.fn()
    })

    await expect(service.getOrCreateCurrentChatContext(stableSession.id)).resolves.toMatchObject({
      id: 'chat-context-1',
      workspaceContext: {
        kind: 'project-session',
        projectSessionId: stableSession.id
      },
      agentSessionId: stableSession.id
    })
    expect(createCurrentChatContext).toHaveBeenCalledWith(stableSession.id, stableSession.id)
    expect(createFreshAgentSession).not.toHaveBeenCalled()
  })

  it('rotates only chat identity while retaining prior contexts and stable workspace metadata', async () => {
    const stableSession = projectSession()
    const stableSnapshot = structuredClone(stableSession)
    const contexts = [chatContext('chat-context-1', stableSession.id)]
    const createCurrentChatContext = vi.fn(
      async (projectSessionId: string, agentSessionId: string) => {
        const created = chatContext('chat-context-2', agentSessionId, projectSessionId)
        contexts.push(created)
        return created
      }
    )
    const freshAgentSession = projectSession({
      id: 'agent-session-2',
      workspaceContextSessionId: stableSession.id,
      transcriptPath: '/transcripts/agent-session-2.jsonl',
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null,
      sourceType: null,
      sourceRepositoryId: null,
      sourceRepositoryNodeId: null,
      sourceRepositoryOwner: null,
      sourceRepositoryName: null,
      sourceNumber: null,
      sourceUrl: null,
      sourceTitle: null
    })
    const createFreshAgentSession = vi.fn(async () => freshAgentSession)
    const service = createProjectSessionChatService({
      findSessionById: async (sessionId) =>
        sessionId === stableSession.id ? stableSession : freshAgentSession,
      getCurrentChatContext: async () => contexts.at(-1),
      createCurrentChatContext,
      createFreshAgentSession,
      deleteAgentSession: vi.fn()
    })

    await expect(service.clearChat(stableSession.id)).resolves.toMatchObject({
      id: 'chat-context-2',
      workspaceContext: {
        kind: 'project-session',
        projectSessionId: stableSession.id
      },
      agentSessionId: freshAgentSession.id
    })

    expect(contexts).toEqual([
      chatContext('chat-context-1', stableSession.id),
      chatContext('chat-context-2', freshAgentSession.id)
    ])
    expect(stableSession).toEqual(stableSnapshot)
    expect(createFreshAgentSession).toHaveBeenCalledWith(stableSession.id)
  })

  it('retains child recovery metadata and surfaces diagnostics when Chat Context persistence and utility rollback fail', async () => {
    const stableSession = projectSession()
    const freshAgentSession = projectSession({
      id: 'agent-session-2',
      workspaceContextSessionId: stableSession.id,
      transcriptPath: '/transcripts/agent-session-2.jsonl',
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const storedSessions = [stableSession, freshAgentSession]
    const utilityFailure = new Error('utility cleanup failed')
    const deleteAgentSession = vi.fn(async () => {
      throw utilityFailure
    })
    const service = createProjectSessionChatService({
      findSessionById: async (sessionId) =>
        storedSessions.find((stored) => stored.id === sessionId),
      getCurrentChatContext: async () => chatContext('chat-context-1', stableSession.id),
      createCurrentChatContext: async () => {
        throw new Error('chat context persistence failed')
      },
      createFreshAgentSession: async () => freshAgentSession,
      deleteAgentSession
    })

    const clearing = service.clearChat(stableSession.id)
    await expect(clearing).rejects.toThrow('projectSessionChat.creationRollbackFailed')
    await expect(clearing).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'chat context persistence failed' })
    })

    expect(deleteAgentSession).toHaveBeenCalledWith(freshAgentSession.id)
    expect(storedSessions).toContain(freshAgentSession)
  })

  it('rejects child and archived Sessions as stable workspace owners', async () => {
    const createService = (stored: StoredSession) =>
      createProjectSessionChatService({
        findSessionById: async () => stored,
        getCurrentChatContext: vi.fn(),
        createCurrentChatContext: vi.fn(),
        createFreshAgentSession: vi.fn(),
        deleteAgentSession: vi.fn()
      })

    await expect(
      createService(projectSession({ workspaceContextSessionId: 'parent-session' })).clearChat(
        'agent-session-child'
      )
    ).rejects.toThrow('Project Session not found')
    await expect(
      createService(projectSession({ archivedAt: timestamp })).clearChat('project-session-1')
    ).rejects.toThrow('Project Session not found')
  })
})
