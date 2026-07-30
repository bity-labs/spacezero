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
      listChatContexts: vi.fn(),
      findChatContextById: vi.fn(),
      createCurrentChatContext,
      setCurrentChatContext: vi.fn(),
      createFreshAgentSession,
      deleteAgentSession: vi.fn(),
      getSessionState: vi.fn()
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
      listChatContexts: vi.fn(),
      findChatContextById: vi.fn(),
      createCurrentChatContext,
      setCurrentChatContext: vi.fn(),
      createFreshAgentSession,
      deleteAgentSession: vi.fn(),
      getSessionState: vi.fn()
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

  it('lists only older Chat Contexts for the current Project Session with initial prompts and dates', async () => {
    const stableSession = projectSession()
    const currentContext = chatContext('chat-context-current', stableSession.id)
    const olderContext = {
      ...chatContext('chat-context-older', 'agent-session-older'),
      createdAt: new Date('2026-07-19T08:30:00.000Z')
    }
    const foreignContext = chatContext(
      'chat-context-foreign',
      'agent-session-foreign',
      'project-session-foreign'
    )
    const olderAgentSession = projectSession({
      id: olderContext.agentSessionId,
      workspaceContextSessionId: stableSession.id,
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const getSessionState = vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      sessionId,
      kind: 'project' as const,
      projectId: stableSession.projectId,
      cwd: stableSession.worktreePath!,
      status: 'idle' as const,
      live: true,
      transcriptPath: `/transcripts/${sessionId}.jsonl`,
      modelProvider: undefined,
      modelId: undefined,
      transcriptSnapshot: [
        {
          role: 'user' as const,
          timestamp: 100,
          content: '  Continue the refactor\nwithout changing the worktree.  '
        }
      ]
    }))
    const service = createProjectSessionChatService({
      findSessionById: async (sessionId) =>
        sessionId === stableSession.id
          ? stableSession
          : sessionId === olderAgentSession.id
            ? olderAgentSession
            : undefined,
      getCurrentChatContext: async () => currentContext,
      listChatContexts: async () => [currentContext, olderContext, foreignContext],
      findChatContextById: vi.fn(),
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext: vi.fn(),
      createFreshAgentSession: vi.fn(),
      deleteAgentSession: vi.fn(),
      getSessionState
    })

    await expect(service.listChatHistory(stableSession.id)).resolves.toEqual([
      {
        id: olderContext.id,
        initialPrompt: 'Continue the refactor without changing the worktree.',
        createdAt: '2026-07-19T08:30:00.000Z'
      }
    ])
    expect(getSessionState).toHaveBeenCalledWith({ sessionId: olderAgentSession.id })
    expect(getSessionState).toHaveBeenCalledTimes(1)
  })

  it('keeps the latest accepted resume current when an earlier clear finishes late', async () => {
    const stableSession = projectSession()
    const initialContext = chatContext('chat-context-current', stableSession.id)
    const selectedContext = chatContext('chat-context-selected', 'agent-session-selected')
    const selectedAgentSession = projectSession({
      id: selectedContext.agentSessionId,
      workspaceContextSessionId: stableSession.id,
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const supersededFreshAgentSession = projectSession({
      id: 'agent-session-superseded',
      workspaceContextSessionId: stableSession.id,
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const subsequentFreshAgentSession = projectSession({
      id: 'agent-session-subsequent',
      workspaceContextSessionId: stableSession.id,
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const firstFreshAgentSession = deferred<StoredSession>()
    let currentContext = initialContext
    let freshAgentSessionCount = 0
    const createFreshAgentSession = vi.fn(async () => {
      freshAgentSessionCount += 1
      return freshAgentSessionCount === 1
        ? firstFreshAgentSession.promise
        : subsequentFreshAgentSession
    })
    const deleteAgentSession = vi.fn(async () => undefined)
    const service = createProjectSessionChatService({
      findSessionById: async (sessionId) =>
        [
          stableSession,
          selectedAgentSession,
          supersededFreshAgentSession,
          subsequentFreshAgentSession
        ].find((stored) => stored.id === sessionId),
      getCurrentChatContext: async () => currentContext,
      listChatContexts: vi.fn(),
      findChatContextById: async (_projectSessionId, chatContextId) =>
        chatContextId === selectedContext.id ? selectedContext : undefined,
      createCurrentChatContext: async (projectSessionId, agentSessionId) => {
        currentContext = chatContext(
          `chat-context-${agentSessionId}`,
          agentSessionId,
          projectSessionId
        )
        return currentContext
      },
      setCurrentChatContext: async () => {
        currentContext = selectedContext
        return currentContext
      },
      createFreshAgentSession,
      deleteAgentSession,
      getSessionState: vi.fn()
    })

    const clearing = service.clearChat(stableSession.id)
    await vi.waitFor(() => expect(createFreshAgentSession).toHaveBeenCalledTimes(1))

    await expect(
      service.resumeChatContext(stableSession.id, selectedContext.id)
    ).resolves.toMatchObject({
      id: selectedContext.id,
      agentSessionId: selectedAgentSession.id
    })

    firstFreshAgentSession.resolve(supersededFreshAgentSession)
    await expect(clearing).resolves.toMatchObject({
      id: selectedContext.id,
      agentSessionId: selectedAgentSession.id
    })
    await expect(service.getOrCreateCurrentChatContext(stableSession.id)).resolves.toMatchObject({
      id: selectedContext.id,
      agentSessionId: selectedAgentSession.id
    })
    expect(deleteAgentSession).toHaveBeenCalledWith(supersededFreshAgentSession.id)

    await expect(service.clearChat(stableSession.id)).resolves.toMatchObject({
      agentSessionId: subsequentFreshAgentSession.id
    })
    await expect(service.getOrCreateCurrentChatContext(stableSession.id)).resolves.toMatchObject({
      agentSessionId: subsequentFreshAgentSession.id
    })
  })

  it('resumes a retained Chat Context in the same Project Session without changing worktree metadata', async () => {
    const stableSession = projectSession()
    const stableSnapshot = structuredClone(stableSession)
    const selectedContext = chatContext('chat-context-selected', 'agent-session-selected')
    const selectedAgentSession = projectSession({
      id: selectedContext.agentSessionId,
      workspaceContextSessionId: stableSession.id,
      transcriptPath: '/transcripts/agent-session-selected.jsonl',
      worktreePath: null,
      worktreeBranch: null,
      worktreeBaseRevision: null
    })
    const setCurrentChatContext = vi.fn(async () => selectedContext)
    const createFreshAgentSession = vi.fn()
    const service = createProjectSessionChatService({
      findSessionById: async (sessionId) =>
        sessionId === stableSession.id ? stableSession : selectedAgentSession,
      getCurrentChatContext: vi.fn(),
      listChatContexts: vi.fn(),
      findChatContextById: async (_projectSessionId, chatContextId) =>
        chatContextId === selectedContext.id ? selectedContext : undefined,
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext,
      createFreshAgentSession,
      deleteAgentSession: vi.fn(),
      getSessionState: vi.fn()
    })

    await expect(
      service.resumeChatContext(stableSession.id, selectedContext.id)
    ).resolves.toMatchObject({
      id: selectedContext.id,
      workspaceContext: { kind: 'project-session', projectSessionId: stableSession.id },
      agentSessionId: selectedAgentSession.id
    })
    expect(setCurrentChatContext).toHaveBeenCalledWith(stableSession.id, selectedContext.id)
    expect(createFreshAgentSession).not.toHaveBeenCalled()
    expect(stableSession).toEqual(stableSnapshot)
  })

  it('rejects Chat Contexts from other Project Sessions', async () => {
    const stableSession = projectSession()
    const foreignContext = chatContext(
      'chat-context-foreign',
      'agent-session-foreign',
      'project-session-foreign'
    )
    const setCurrentChatContext = vi.fn()
    const service = createProjectSessionChatService({
      findSessionById: async () => stableSession,
      getCurrentChatContext: vi.fn(),
      listChatContexts: vi.fn(),
      findChatContextById: async () => foreignContext,
      createCurrentChatContext: vi.fn(),
      setCurrentChatContext,
      createFreshAgentSession: vi.fn(),
      deleteAgentSession: vi.fn(),
      getSessionState: vi.fn()
    })

    await expect(service.resumeChatContext(stableSession.id, foreignContext.id)).rejects.toThrow(
      'Project Session Chat Context was not found'
    )
    expect(setCurrentChatContext).not.toHaveBeenCalled()
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
      listChatContexts: vi.fn(),
      findChatContextById: vi.fn(),
      createCurrentChatContext: async () => {
        throw new Error('chat context persistence failed')
      },
      setCurrentChatContext: vi.fn(),
      createFreshAgentSession: async () => freshAgentSession,
      deleteAgentSession,
      getSessionState: vi.fn()
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
        listChatContexts: vi.fn(),
        findChatContextById: vi.fn(),
        createCurrentChatContext: vi.fn(),
        setCurrentChatContext: vi.fn(),
        createFreshAgentSession: vi.fn(),
        deleteAgentSession: vi.fn(),
        getSessionState: vi.fn()
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value)
    }
  }
}
