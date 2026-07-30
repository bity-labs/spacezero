import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'

const mocks = vi.hoisted(() => {
  const timestamp = new Date('2026-07-30T12:00:00.000Z')
  const ownerSession = {
    id: 'project-session-1',
    projectId: 'project-1',
    title: 'Fix the issue',
    status: 'idle' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    transcriptPath: '/transcripts/project-session-1.jsonl',
    worktreePath: '/worktrees/project-1/project-session-1',
    worktreeBranch: 'spacezero/issue-361-project-session-1',
    worktreeBaseRevision: 'abc123'
  }
  const childSession = {
    ...ownerSession,
    id: 'agent-session-retained',
    workspaceContextSessionId: ownerSession.id,
    transcriptPath: '/transcripts/agent-session-retained.jsonl',
    worktreePath: null,
    worktreeBranch: null,
    worktreeBaseRevision: null
  }
  const currentContext = {
    id: 'chat-context-current',
    workspaceContextKey: ownerSession.id,
    agentSessionId: ownerSession.id,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const retainedContext = {
    id: 'chat-context-retained',
    workspaceContextKey: ownerSession.id,
    agentSessionId: childSession.id,
    createdAt: new Date('2026-07-29T08:30:00.000Z'),
    updatedAt: new Date('2026-07-29T08:30:00.000Z')
  }
  const repository = {
    findSessionById: vi.fn(async (sessionId: string) =>
      [ownerSession, childSession].find((session) => session.id === sessionId)
    ),
    deleteById: vi.fn(async () => undefined)
  }
  const chatRepository = {
    getCurrentChatContext: vi.fn(async () => currentContext),
    listChatContexts: vi.fn(async () => [currentContext, retainedContext]),
    findChatContextById: vi.fn(),
    createCurrentChatContext: vi.fn(),
    setCurrentChatContext: vi.fn()
  }
  const utilityHost = {
    getState: vi.fn(async () => {
      throw new Error('agent.sessionNotFound')
    })
  }
  const worktrees = { validate: vi.fn(async () => true) }

  return {
    ownerSession,
    childSession,
    repository,
    chatRepository,
    utilityHost,
    worktrees,
    restoreAgentSessionState: vi.fn()
  }
})

vi.mock('../../agent-workspace/main/agent-session-handler', () => ({
  createProjectChatAgentSession: vi.fn(),
  restoreAgentSessionState: mocks.restoreAgentSessionState
}))
vi.mock('../../agent-workspace/main/agent-skill-settings.service', () => ({
  getDisabledGlobalSkillPaths: vi.fn(async () => [])
}))
vi.mock('../../agent-workspace/main/agent-skill-paths', () => ({
  resolveAgentSkillPaths: vi.fn(async () => [])
}))
vi.mock('../../agent-workspace/main/agent-utility-process', () => ({
  getAgentUtilityProcessHost: () => mocks.utilityHost
}))
vi.mock('../../knowledge-base/main', () => ({
  getKnowledgeBaseRootProvider: vi.fn(),
  getKnowledgeBaseService: () => ({
    getStatus: vi.fn(async () => ({ setupState: 'not-configured' }))
  })
}))
vi.mock('./managed-worktree.runtime', () => ({
  getManagedWorktreeService: () => mocks.worktrees
}))
vi.mock('./project-session-chat.repository', () => ({
  createProjectSessionChatRepository: () => mocks.chatRepository
}))
vi.mock('./sessions.repository', () => ({
  createSessionsRepository: () => mocks.repository
}))

import { getProjectSessionChatService } from './project-session-chat.runtime'

describe('Project Session chat runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.restoreAgentSessionState.mockImplementation(async (request, dependencies) => {
      await expect(dependencies.utilityHost.getState(request)).rejects.toThrow(
        'agent.sessionNotFound'
      )
      const child = await dependencies.repository.findSessionById(request.sessionId)
      const owner = await dependencies.repository.findSessionById(
        child?.workspaceContextSessionId ?? ''
      )
      await dependencies.worktrees.validate({
        sessionId: owner?.id,
        projectId: owner?.projectId,
        worktreePath: owner?.worktreePath
      })
      return {
        sessionId: request.sessionId,
        kind: 'project',
        projectId: owner?.projectId,
        cwd: owner?.worktreePath,
        status: 'idle',
        live: true,
        transcriptPath: child?.transcriptPath,
        transcriptSnapshot: [
          {
            role: 'user',
            timestamp: 100,
            content: 'Restore this retained Project Session transcript'
          }
        ]
      } as AgentSessionState
    })
  })

  it('restores cold retained history through the authenticated owner Project Session worktree', async () => {
    await expect(
      getProjectSessionChatService().listChatHistory(mocks.ownerSession.id)
    ).resolves.toEqual([
      {
        id: 'chat-context-retained',
        initialPrompt: 'Restore this retained Project Session transcript',
        createdAt: '2026-07-29T08:30:00.000Z'
      }
    ])

    expect(mocks.restoreAgentSessionState).toHaveBeenCalledWith(
      { sessionId: mocks.childSession.id },
      expect.objectContaining({
        repository: mocks.repository,
        utilityHost: mocks.utilityHost,
        worktrees: mocks.worktrees
      })
    )
    expect(mocks.utilityHost.getState).toHaveBeenCalledWith({ sessionId: mocks.childSession.id })
    expect(mocks.worktrees.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: mocks.ownerSession.id,
        worktreePath: mocks.ownerSession.worktreePath
      })
    )
  })
})
