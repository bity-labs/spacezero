import { SessionManager } from '@earendil-works/pi-coding-agent'
import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState, CreateAgentSessionRequest } from '../../../shared/agent-protocol'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import { createProjectChatAgentSession, restoreAgentSessionState } from './agent-session-handler'

const timestamp = new Date('2026-07-30T12:00:00.000Z')

function stableProjectSession(): StoredSession {
  return {
    id: 'project-session-1',
    projectId: 'project-1',
    title: 'Fix issue 360',
    status: 'idle',
    createdAt: timestamp,
    updatedAt: timestamp,
    transcriptPath: '/transcripts/project-session-1.jsonl',
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet',
    thinkingLevel: 'medium',
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
    sourceTitle: 'Project Sessions support /clear'
  }
}

function createRepository(owner: StoredSession): {
  repository: SessionsRepository
  sessions: StoredSession[]
} {
  const sessions = [owner]
  return {
    sessions,
    repository: {
      async listProjectSessions() {
        return sessions.filter((session) => session.projectId && !session.workspaceContextSessionId)
      },
      async create(session) {
        sessions.push(session)
        return session
      },
      async countByProjectId() {
        return 1
      },
      async projectExists(projectId) {
        return projectId === 'project-1'
      },
      async findProjectById(projectId) {
        return projectId === 'project-1'
          ? { id: 'project-1', path: '/repo', agentResourcesTrusted: true }
          : undefined
      },
      async updateProjectPath() {},
      async hasManagedSessions() {
        return true
      },
      async findSessionById(sessionId) {
        return sessions.find((session) => session.id === sessionId)
      },
      async update(session) {
        const index = sessions.findIndex((candidate) => candidate.id === session.id)
        if (index >= 0) sessions[index] = session
        return session
      },
      async deleteById(sessionId) {
        const index = sessions.findIndex((session) => session.id === sessionId)
        if (index >= 0) sessions.splice(index, 1)
      },
      async listByProjectIdIncludingArchived(projectId) {
        return sessions.filter((session) => session.projectId === projectId)
      },
      async updateMany(nextSessions) {
        return nextSessions
      },
      async deleteByProjectId() {}
    }
  }
}

function freshState(): AgentSessionState {
  return {
    sessionId: 'agent-session-2',
    kind: 'project',
    projectId: 'project-1',
    cwd: '/worktrees/project-1/project-session-1',
    status: 'idle',
    live: true,
    transcriptPath: '/transcripts/agent-session-2.jsonl',
    modelProvider: 'anthropic',
    modelId: 'claude-sonnet',
    thinkingLevel: 'medium',
    transcriptSnapshot: []
  }
}

describe('createProjectChatAgentSession', () => {
  it('creates a fresh agent with a Pi-valid ID in the existing managed worktree', async () => {
    const owner = stableProjectSession()
    const ownerSnapshot = structuredClone(owner)
    const { repository, sessions } = createRepository(owner)
    const utilityHost = {
      createSession: vi.fn(async (request: CreateAgentSessionRequest) => {
        SessionManager.inMemory(request.cwd, { id: request.sessionId })
        return freshState()
      }),
      deleteSession: vi.fn(async () => undefined)
    }
    const createSessionId = vi
      .fn<() => string>()
      .mockReturnValueOnce('invalid-project-chat-')
      .mockReturnValueOnce('agent-session-2')
    const worktrees = {
      validate: vi.fn(async () => true),
      create: vi.fn(),
      remove: vi.fn()
    }

    await expect(
      createProjectChatAgentSession(owner.id, {
        repository,
        utilityHost,
        worktrees,
        createSessionId,
        readModelDefaults: async () => ({
          defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
          defaultThinking: 'medium'
        }),
        resolveSkillPaths: async () => []
      })
    ).resolves.toMatchObject({
      id: 'agent-session-2',
      projectId: 'project-1',
      workspaceContextSessionId: owner.id,
      transcriptPath: '/transcripts/agent-session-2.jsonl'
    })

    expect(createSessionId).toHaveBeenCalledTimes(2)
    expect(sessions[1]).not.toHaveProperty('worktreePath')
    expect(sessions[1]).not.toHaveProperty('worktreeBranch')
    expect(sessions[1]).not.toHaveProperty('worktreeBaseRevision')
    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'agent-session-2',
        kind: 'project',
        projectId: 'project-1',
        cwd: owner.worktreePath,
        systemPromptContext: expect.stringContaining('Issue'),
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        thinkingLevel: 'medium'
      })
    )
    expect(worktrees.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sessionId: owner.id,
        worktree: {
          path: owner.worktreePath,
          branch: owner.worktreeBranch,
          baseRevision: owner.worktreeBaseRevision
        }
      })
    )
    expect(worktrees.create).not.toHaveBeenCalled()
    expect(worktrees.remove).not.toHaveBeenCalled()
    expect(sessions[0]).toEqual(ownerSnapshot)
  })

  it('retains child recovery metadata and surfaces diagnostics when persistence and utility rollback fail', async () => {
    const owner = stableProjectSession()
    const { repository, sessions } = createRepository(owner)
    let createCalls = 0
    repository.create = vi.fn(async (storedSession) => {
      createCalls += 1
      if (createCalls === 1) throw new Error('child persistence failed')
      sessions.push(storedSession)
      return storedSession
    })
    const utilityHost = {
      createSession: vi.fn(async () => freshState()),
      deleteSession: vi.fn(async () => {
        throw new Error('utility cleanup failed')
      })
    }

    const creation = createProjectChatAgentSession(owner.id, {
      repository,
      utilityHost,
      worktrees: { validate: vi.fn(async () => true) },
      createSessionId: () => 'agent-session-2',
      readModelDefaults: async () => ({
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        defaultThinking: 'medium'
      }),
      resolveSkillPaths: async () => []
    })

    await expect(creation).rejects.toThrow('session.creationRollbackFailed')
    await expect(creation).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'child persistence failed' })
    })
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: 'agent-session-2' })
    expect(createCalls).toBe(2)
    expect(sessions).toContainEqual(
      expect.objectContaining({
        id: 'agent-session-2',
        workspaceContextSessionId: owner.id,
        transcriptPath: '/transcripts/agent-session-2.jsonl'
      })
    )
  })

  it('restores a historical Chat Context agent in its owning Project Session worktree', async () => {
    const owner = stableProjectSession()
    const { repository, sessions } = createRepository(owner)
    sessions.push({
      id: 'agent-session-2',
      projectId: owner.projectId,
      workspaceContextSessionId: owner.id,
      title: owner.title,
      status: 'idle',
      createdAt: timestamp,
      updatedAt: timestamp,
      transcriptPath: '/transcripts/agent-session-2.jsonl',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet',
      thinkingLevel: 'medium'
    })
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => freshState())
    }
    const worktrees = { validate: vi.fn(async () => true) }

    await restoreAgentSessionState(
      { sessionId: 'agent-session-2' },
      {
        repository,
        utilityHost,
        worktrees,
        resolveSkillPaths: async () => []
      }
    )

    expect(worktrees.validate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: owner.id })
    )
    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'agent-session-2',
        kind: 'project',
        projectId: owner.projectId,
        cwd: owner.worktreePath,
        transcriptPath: '/transcripts/agent-session-2.jsonl',
        systemPromptContext: expect.stringContaining(owner.sourceUrl ?? '')
      })
    )
  })
})
