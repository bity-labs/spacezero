import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import {
  createManagedProjectAgentSession,
  createProjectAgentSession,
  createProjectKnowledgeBaseInstructions,
  createWorkspaceAgentSession,
  restoreAgentSessionState
} from './agent-session-handler'

function createRepository(overrides: Partial<SessionsRepository> = {}): SessionsRepository {
  const sessions: StoredSession[] = []

  return {
    async listProjectSessions() {
      return sessions.filter((session) => session.projectId !== null)
    },
    async listWorkspaceSessions() {
      return sessions.filter((session) => session.projectId === null)
    },
    async create(session) {
      sessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return sessions.filter((session) => session.projectId === projectId).length
    },
    async countWorkspaceSessions() {
      return sessions.filter((session) => session.projectId === null).length
    },
    async projectExists(projectId) {
      return projectId === 'project-1'
    },
    async findProjectById(projectId) {
      if (projectId !== 'project-1') return undefined
      return { id: projectId, path: '/repo' }
    },
    async updateProjectPath() {},
    async hasManagedSessions(projectId) {
      return sessions.some(
        (session) =>
          session.projectId === projectId &&
          Boolean(session.worktreePath || session.worktreeBranch || session.worktreeBaseRevision)
      )
    },
    async findSessionById(sessionId) {
      return sessions.find((session) => session.id === sessionId)
    },
    async update(session) {
      const index = sessions.findIndex((item) => item.id === session.id)
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
      for (const session of nextSessions) {
        const index = sessions.findIndex((item) => item.id === session.id)
        if (index >= 0) sessions[index] = session
      }
      return nextSessions
    },
    async deleteByProjectId(projectId) {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index].projectId === projectId) sessions.splice(index, 1)
      }
    },
    ...overrides
  }
}

function createState(overrides: Partial<AgentSessionState> = {}): AgentSessionState {
  return {
    sessionId: 'session-1',
    kind: 'project',
    projectId: 'project-1',
    cwd: '/repo',
    status: 'idle',
    live: true,
    transcriptPath: '/agent/sessions/session-1.jsonl',
    modelProvider: 'faux',
    modelId: 'faux-1',
    thinkingLevel: 'medium',
    ...overrides
  }
}

const readModelDefaults = async () => ({
  defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
  defaultThinking: 'high' as const
})

const getConfiguredKnowledgeBaseStatus = async () => ({
  setupState: 'configured' as const,
  rootPath: '/home/builder/SpaceZero/knowledge-base'
})

function createTestWorktrees() {
  return {
    create: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
      path: `/worktrees/${sessionId}`,
      branch: `spacezero/session-${sessionId}`,
      baseRevision: 'abc123'
    })),
    remove: vi.fn(async () => undefined),
    validate: vi.fn(async () => true)
  }
}

describe('createProjectAgentSession', () => {
  it('derives a managed worktree cwd from stored Project metadata', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' })),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/repo/../repo' },
        {
          repository: createRepository(),
          utilityHost,
          worktrees: createTestWorktrees(),
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).resolves.toMatchObject({ sessionId: 'session-1', cwd: '/worktrees/session-1' })

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        kind: 'project',
        projectId: 'project-1',
        cwd: '/worktrees/session-1',
        workspaceTools: expect.arrayContaining([
          expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
        ]),
        appendSystemPrompt: [expect.stringContaining('not configured')],
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        thinkingLevel: 'high',
        delegationDefinitions: expect.arrayContaining([
          expect.objectContaining({ id: 'scout', name: 'Scout' })
        ])
      })
    )
  })

  it('injects durable project Knowledge Base guidance and the linked folder path', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }
    const repository = createRepository({
      async findProjectById(projectId) {
        return {
          id: projectId,
          path: '/repo',
          knowledgeBasePath: '/home/builder/SpaceZero/knowledge-base/projects/space-zero'
        }
      }
    })

    await createProjectAgentSession(
      { projectId: 'project-1', cwd: '/repo' },
      {
        repository,
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults,
        getKnowledgeBaseStatus: getConfiguredKnowledgeBaseStatus
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [
          expect.stringContaining('/home/builder/SpaceZero/knowledge-base/projects/space-zero')
        ]
      })
    )
    const instructions = createProjectKnowledgeBaseInstructions(
      '/home/builder/SpaceZero/knowledge-base/projects/space-zero'
    )
    expect(instructions).toContain('durable notes, decisions, debugging findings')
    expect(instructions).toContain('Do not fill it with transient output')
    expect(instructions).toContain('update the project README.md index')
  })

  it('does not inject a stale project link when the Knowledge Base is unavailable', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }
    const repository = createRepository({
      async findProjectById(projectId) {
        return {
          id: projectId,
          path: '/repo',
          knowledgeBasePath: '/home/builder/SpaceZero/knowledge-base/projects/space-zero'
        }
      }
    })

    await createProjectAgentSession(
      { projectId: 'project-1', cwd: '/repo' },
      {
        repository,
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults,
        getKnowledgeBaseStatus: async () => ({
          setupState: 'unavailable',
          rootPath: '/home/builder/SpaceZero/knowledge-base',
          reason: 'missing'
        })
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [expect.stringContaining('not configured')]
      })
    )
    expect(JSON.stringify(utilityHost.createSession.mock.calls)).not.toContain(
      '/projects/space-zero'
    )
  })

  it('tells project sessions to report missing Knowledge Base setup without inventing a save', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await createProjectAgentSession(
      { projectId: 'project-1', cwd: '/repo' },
      {
        repository: createRepository(),
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [expect.stringContaining('not configured')]
      })
    )
  })

  it('resolves an Agent Definition reference before creating a project utility session', async () => {
    const utilityHost = {
      createSession: vi.fn(async () =>
        createState({
          agentDefinition: { id: 'reviewer', name: 'Reviewer' },
          modelProvider: 'faux',
          modelId: 'faux-1',
          thinkingLevel: 'high'
        })
      ),
      deleteSession: vi.fn(async () => undefined)
    }
    const repository = createRepository()

    await createManagedProjectAgentSession(
      {
        projectId: 'project-1',
        agentDefinition: { id: 'reviewer' }
      },
      {
        repository,
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults,
        resolveAgentDefinition: async (reference) => {
          expect(reference).toEqual({ id: 'reviewer' })
          return {
            id: 'reviewer',
            name: 'Reviewer',
            body: 'Review code carefully.',
            model: { providerId: 'faux', modelId: 'faux-1' },
            thinkingLevel: 'high',
            tools: ['read', 'workspace.getStatus']
          }
        }
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        thinkingLevel: 'high',
        agentDefinition: {
          id: 'reviewer',
          name: 'Reviewer',
          body: 'Review code carefully.',
          model: { providerId: 'faux', modelId: 'faux-1' },
          thinkingLevel: 'high',
          tools: ['read', 'workspace.getStatus']
        }
      })
    )
    await expect(repository.findSessionById('session-1')).resolves.toMatchObject({
      agentDefinitionSnapshot: JSON.stringify({
        id: 'reviewer',
        name: 'Reviewer',
        body: 'Review code carefully.',
        model: { providerId: 'faux', modelId: 'faux-1' },
        thinkingLevel: 'high',
        tools: ['read', 'workspace.getStatus']
      })
    })
  })

  it('passes project skill paths to a trusted project session', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }
    const readProjectTrust = vi.fn(async () => true)

    await createProjectAgentSession(
      { projectId: 'project-1', cwd: '/repo' },
      {
        repository: createRepository(),
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults,
        readProjectTrust,
        readDisabledGlobalSkillPaths: async () => ['/Users/tiby/.agents/skills/review/SKILL.md'],
        resolveSkillPaths: async () => [
          { path: '/repo/.agents/skills', scope: 'project' as const },
          { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' as const }
        ]
      }
    )

    expect(readProjectTrust).toHaveBeenCalledWith('project-1', '/repo')
    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        skillPaths: [
          { path: '/repo/.agents/skills', scope: 'project' },
          { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' }
        ],
        disabledGlobalSkillPaths: ['/Users/tiby/.agents/skills/review/SKILL.md']
      })
    )
  })

  it('denies project skill paths without an explicit trust decision', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await createProjectAgentSession(
      { projectId: 'project-1', cwd: '/repo' },
      {
        repository: createRepository(),
        utilityHost,
        worktrees: createTestWorktrees(),
        createSessionId: () => 'session-1',
        readModelDefaults,
        readProjectTrust: async () => false,
        resolveSkillPaths: async () => [
          { path: '/repo/.agents/skills', scope: 'project' as const },
          { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' as const }
        ]
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        skillPaths: [{ path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' }]
      })
    )
  })

  it('persists a source link and passes runtime-only Issue context to Pi', async () => {
    const repository = createRepository()
    const worktrees = createTestWorktrees()
    const utilityHost = {
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' })),
      deleteSession: vi.fn(async () => undefined)
    }

    const { session } = await createManagedProjectAgentSession(
      {
        projectId: 'project-1',
        title: 'Issue #83: GitHub integration',
        source: {
          type: 'issue',
          repositoryId: '1000',
          repositoryNodeId: 'R_1000',
          repositoryOwner: 'bity-labs',
          repositoryName: 'spacezero',
          repositoryFullName: 'bity-labs/spacezero',
          number: 83,
          url: 'https://github.com/bity-labs/spacezero/issues/83',
          title: 'GitHub integration'
        },
        systemPromptContext: 'Live Issue context without an automatic GitHub write.'
      },
      {
        repository,
        utilityHost,
        worktrees,
        createSessionId: () => 'session-1',
        readModelDefaults
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/worktrees/session-1',
        systemPromptContext: 'Live Issue context without an automatic GitHub write.'
      })
    )
    expect(session).toMatchObject({
      worktree: { path: '/worktrees/session-1', baseRevision: 'abc123' },
      source: { type: 'issue', repositoryId: '1000', number: 83 }
    })
  })

  it('rejects a renderer-supplied cwd that does not match the stored project path', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/tmp/not-this-project' },
        {
          repository: createRepository(),
          utilityHost,
          worktrees: createTestWorktrees(),
          createSessionId: () => 'session-1'
        }
      )
    ).rejects.toThrow('Session cwd must match the project path')

    expect(utilityHost.createSession).not.toHaveBeenCalled()
  })

  it('cleans up the live utility session and worktree when metadata persistence fails', async () => {
    const persistenceError = new Error('db write failed')
    const worktrees = createTestWorktrees()
    const utilityHost = {
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' })),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/repo' },
        {
          repository: createRepository({
            async create() {
              throw persistenceError
            }
          }),
          utilityHost,
          worktrees,
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).rejects.toThrow('db write failed')

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        kind: 'project',
        projectId: 'project-1',
        cwd: '/worktrees/session-1',
        workspaceTools: expect.arrayContaining([
          expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
        ]),
        appendSystemPrompt: [expect.stringContaining('not configured')],
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        thinkingLevel: 'high',
        delegationDefinitions: expect.arrayContaining([
          expect.objectContaining({ id: 'scout', name: 'Scout' })
        ])
      })
    )
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(worktrees.remove).toHaveBeenCalledWith({
      projectPath: '/repo',
      projectId: 'project-1',
      sessionId: 'session-1',
      worktree: {
        path: '/worktrees/session-1',
        branch: 'spacezero/session-session-1',
        baseRevision: 'abc123'
      }
    })
  })

  it('retains recoverable Session metadata when utility rollback fails', async () => {
    let createCalls = 0
    let recoverySession: StoredSession | undefined
    const repository = createRepository({
      async create(session) {
        createCalls += 1
        if (createCalls === 1) throw new Error('db write failed')
        recoverySession = session
        return session
      },
      async findSessionById(sessionId) {
        return recoverySession?.id === sessionId ? recoverySession : undefined
      }
    })
    const worktrees = createTestWorktrees()
    const utilityHost = {
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' })),
      deleteSession: vi.fn(async () => {
        throw new Error('utility cleanup failed')
      })
    }

    await expect(
      createManagedProjectAgentSession(
        { projectId: 'project-1' },
        {
          repository,
          utilityHost,
          worktrees,
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).rejects.toThrow('session.creationRollbackFailed')

    expect(createCalls).toBe(2)
    expect(worktrees.remove).not.toHaveBeenCalled()
    await expect(repository.findSessionById('session-1')).resolves.toMatchObject({
      id: 'session-1',
      worktreePath: '/worktrees/session-1',
      worktreeBranch: 'spacezero/session-session-1'
    })
  })

  it('retains recoverable Session metadata when Git rollback fails', async () => {
    let createCalls = 0
    let recoverySession: StoredSession | undefined
    const repository = createRepository({
      async create(session) {
        createCalls += 1
        if (createCalls === 1) throw new Error('db write failed')
        recoverySession = session
        return session
      },
      async findSessionById(sessionId) {
        return recoverySession?.id === sessionId ? recoverySession : undefined
      }
    })
    const worktrees = createTestWorktrees()
    worktrees.remove = vi.fn(async () => {
      throw new Error('session.worktreeRemoveFailed')
    })
    const utilityHost = {
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' })),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createManagedProjectAgentSession(
        { projectId: 'project-1' },
        {
          repository,
          utilityHost,
          worktrees,
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).rejects.toThrow('session.creationRollbackFailed')

    expect(createCalls).toBe(2)
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
    await expect(repository.findSessionById('session-1')).resolves.toMatchObject({
      id: 'session-1',
      worktreePath: '/worktrees/session-1',
      worktreeBaseRevision: 'abc123'
    })
  })
})

describe('restoreAgentSessionState', () => {
  it('returns live utility state when the session is already registered', async () => {
    const utilityHost = {
      getState: vi.fn(async () => createState()),
      createSession: vi.fn(async () => createState())
    }

    await expect(
      restoreAgentSessionState(
        { sessionId: 'session-1' },
        { repository: createRepository(), utilityHost }
      )
    ).resolves.toMatchObject({ sessionId: 'session-1' })

    expect(utilityHost.createSession).not.toHaveBeenCalled()
  })

  it('coalesces concurrent restores for the same stored session', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    let resolveCreate: ((state: AgentSessionState) => void) | undefined
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(
        () =>
          new Promise<AgentSessionState>((resolve) => {
            resolveCreate = resolve
          })
      )
    }
    const dependencies = {
      repository: createRepository({
        async findSessionById() {
          return storedSession
        }
      }),
      utilityHost
    }

    const firstRestore = restoreAgentSessionState({ sessionId: 'session-1' }, dependencies)
    await vi.waitFor(() => expect(utilityHost.createSession).toHaveBeenCalledTimes(1))
    const secondRestore = restoreAgentSessionState({ sessionId: 'session-1' }, dependencies)

    resolveCreate?.(createState())

    await expect(Promise.all([firstRestore, secondRestore])).resolves.toEqual([
      createState(),
      createState()
    ])
    expect(utilityHost.createSession).toHaveBeenCalledTimes(1)
  })

  it('returns live utility state when a concurrent restore already recreated the session', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    const restoredState = createState()
    const utilityHost = {
      getState: vi.fn(async () => {
        if (utilityHost.getState.mock.calls.length === 1) throw new Error('agent.sessionNotFound')
        return restoredState
      }),
      createSession: vi.fn(async () => {
        throw new Error('agent.sessionAlreadyExists')
      })
    }

    await expect(
      restoreAgentSessionState(
        { sessionId: 'session-1' },
        {
          repository: createRepository({
            async findSessionById() {
              return storedSession
            }
          }),
          utilityHost
        }
      )
    ).resolves.toBe(restoredState)
  })

  it('restores persisted model and thinking selections after app relaunch', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl',
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'high'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await restoreAgentSessionState(
      { sessionId: 'session-1' },
      {
        repository: createRepository({
          async findSessionById() {
            return storedSession
          }
        }),
        utilityHost
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModel: { providerId: 'openai', modelId: 'gpt-5' },
        thinkingLevel: 'high'
      })
    )
  })

  it('restores a project session with its current Knowledge Base folder guidance', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await restoreAgentSessionState(
      { sessionId: 'session-1' },
      {
        repository: createRepository({
          async findSessionById() {
            return storedSession
          },
          async findProjectById(projectId) {
            return {
              id: projectId,
              path: '/repo',
              knowledgeBasePath: '/knowledge/projects/space-zero'
            }
          }
        }),
        utilityHost,
        getKnowledgeBaseStatus: async () => ({
          setupState: 'configured',
          rootPath: '/knowledge'
        })
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [expect.stringContaining('/knowledge/projects/space-zero')]
      })
    )
  })

  it('does not restore stale Knowledge Base guidance while the repository is unavailable', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await restoreAgentSessionState(
      { sessionId: 'session-1' },
      {
        repository: createRepository({
          async findSessionById() {
            return storedSession
          },
          async findProjectById(projectId) {
            return {
              id: projectId,
              path: '/repo',
              knowledgeBasePath: '/knowledge/projects/space-zero'
            }
          }
        }),
        utilityHost,
        getKnowledgeBaseStatus: async () => ({
          setupState: 'unavailable',
          rootPath: '/knowledge',
          reason: 'missing'
        })
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [expect.stringContaining('not configured')]
      })
    )
    expect(JSON.stringify(utilityHost.createSession.mock.calls)).not.toContain(
      '/knowledge/projects/space-zero'
    )
  })

  it('rechecks project trust before restoring project skill paths', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await restoreAgentSessionState(
      { sessionId: 'session-1' },
      {
        repository: createRepository({
          async findSessionById() {
            return storedSession
          }
        }),
        utilityHost,
        readProjectTrust: async () => false,
        resolveSkillPaths: async () => [
          { path: '/repo/.agents/skills', scope: 'project' as const },
          { path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' as const }
        ]
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        skillPaths: [{ path: '/Users/tiby/SpaceZero/skills', scope: 'spacezero' }]
      })
    )
  })

  it('restores an Issue-linked agent in its persisted worktree with durable source context', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Issue #83: GitHub integration',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl',
      worktreePath: '/worktrees/session-1',
      worktreeBranch: 'spacezero/issue-83-session-1',
      worktreeBaseRevision: 'abc123',
      sourceType: 'issue',
      sourceRepositoryId: '1000',
      sourceRepositoryNodeId: 'R_1000',
      sourceRepositoryOwner: 'bity-labs',
      sourceRepositoryName: 'spacezero',
      sourceNumber: 83,
      sourceUrl: 'https://github.com/bity-labs/spacezero/issues/83',
      sourceTitle: 'GitHub integration'
    }
    const worktrees = { validate: vi.fn(async () => true) }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState({ cwd: '/worktrees/session-1' }))
    }

    await restoreAgentSessionState(
      { sessionId: 'session-1' },
      {
        repository: createRepository({
          async findSessionById() {
            return storedSession
          }
        }),
        utilityHost,
        worktrees
      }
    )

    expect(worktrees.validate).toHaveBeenCalledWith({
      projectPath: '/repo',
      projectId: 'project-1',
      sessionId: 'session-1',
      worktree: {
        path: '/worktrees/session-1',
        branch: 'spacezero/issue-83-session-1',
        baseRevision: 'abc123'
      }
    })
    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/worktrees/session-1',
        systemPromptContext: expect.stringContaining(
          'https://github.com/bity-labs/spacezero/issues/83'
        )
      })
    )
  })

  it.each([
    { worktreePath: '/worktrees/session-1' },
    { worktreeBranch: 'spacezero/session-session-1' },
    { worktreeBaseRevision: 'abc123' },
    {
      worktreePath: '/worktrees/session-1',
      worktreeBranch: 'spacezero/session-session-1'
    },
    {
      worktreePath: '/worktrees/session-1',
      worktreeBaseRevision: 'abc123'
    },
    {
      worktreeBranch: 'spacezero/session-session-1',
      worktreeBaseRevision: 'abc123'
    }
  ])('rejects partial managed-worktree metadata before restoring an agent', async (metadata) => {
    const storedSession: StoredSession = {
      id: 'session-partial',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...metadata
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }
    const worktrees = { validate: vi.fn(async () => true) }

    await expect(
      restoreAgentSessionState(
        { sessionId: storedSession.id },
        {
          repository: createRepository({
            async findSessionById() {
              return storedSession
            }
          }),
          utilityHost,
          worktrees
        }
      )
    ).rejects.toThrow('session.worktreeMetadataIncomplete')
    expect(worktrees.validate).not.toHaveBeenCalled()
    expect(utilityHost.createSession).not.toHaveBeenCalled()
  })

  it('fails explicitly instead of restoring a managed Session in the base checkout', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      worktreePath: '/worktrees/missing',
      worktreeBranch: 'spacezero/session-session-1',
      worktreeBaseRevision: 'abc123'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await expect(
      restoreAgentSessionState(
        { sessionId: 'session-1' },
        {
          repository: createRepository({
            async findSessionById() {
              return storedSession
            }
          }),
          utilityHost,
          worktrees: { validate: async () => false }
        }
      )
    ).rejects.toThrow('session.worktreeMissing')
    expect(utilityHost.createSession).not.toHaveBeenCalled()
  })

  it('restores the immutable applied Agent Definition snapshot after app relaunch', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl',
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'low',
      agentDefinitionSnapshot: JSON.stringify({
        id: 'read-only',
        name: 'Read Only',
        body: 'Only inspect files. Do not modify project files.',
        model: { providerId: 'faux', modelId: 'faux-1' },
        thinkingLevel: 'high',
        tools: ['read']
      })
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () =>
        createState({
          agentDefinition: { id: 'read-only', name: 'Read Only' },
          modelProvider: 'openai',
          modelId: 'gpt-5',
          thinkingLevel: 'low'
        })
      )
    }

    await expect(
      restoreAgentSessionState(
        { sessionId: 'session-1' },
        {
          repository: createRepository({
            async findSessionById() {
              return storedSession
            }
          }),
          utilityHost
        }
      )
    ).resolves.toMatchObject({
      agentDefinition: { id: 'read-only', name: 'Read Only' },
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'low'
    })

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptPath: '/agent/sessions/session-1.jsonl',
        defaultModel: { providerId: 'openai', modelId: 'gpt-5' },
        thinkingLevel: 'low',
        agentDefinition: {
          id: 'read-only',
          name: 'Read Only',
          body: 'Only inspect files. Do not modify project files.',
          model: { providerId: 'openai', modelId: 'gpt-5' },
          thinkingLevel: 'low',
          tools: ['read']
        }
      })
    )
  })

  it('recreates a stored project session from its transcript after app relaunch', async () => {
    const storedSession: StoredSession = {
      id: 'session-1',
      projectId: 'project-1',
      title: 'Session 1',
      status: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
      transcriptPath: '/agent/sessions/session-1.jsonl'
    }
    const utilityHost = {
      getState: vi.fn(async () => {
        throw new Error('agent.sessionNotFound')
      }),
      createSession: vi.fn(async () => createState())
    }

    await expect(
      restoreAgentSessionState(
        { sessionId: 'session-1' },
        {
          repository: createRepository({
            async findSessionById() {
              return storedSession
            }
          }),
          utilityHost
        }
      )
    ).resolves.toMatchObject({ sessionId: 'session-1', cwd: '/repo' })

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        kind: 'project',
        projectId: 'project-1',
        cwd: '/repo',
        transcriptPath: '/agent/sessions/session-1.jsonl',
        workspaceTools: expect.arrayContaining([
          expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
        ]),
        appendSystemPrompt: [expect.stringContaining('not configured')],
        thinkingLevel: undefined,
        delegationDefinitions: expect.arrayContaining([
          expect.objectContaining({ id: 'scout', name: 'Scout' })
        ])
      })
    )
  })
})

describe('createWorkspaceAgentSession', () => {
  it('persists a Knowledge Base chat as a system-managed Workspace Session', async () => {
    const utilityHost = {
      createSession: vi.fn(async () =>
        createState({
          kind: 'workspace',
          projectId: null,
          cwd: '/tmp/spacezero-workspace-sessions'
        })
      ),
      deleteSession: vi.fn(async () => undefined)
    }
    const repository = createRepository()

    await createWorkspaceAgentSession({
      repository,
      utilityHost,
      createSessionId: () => 'knowledge-base-session-1',
      readModelDefaults,
      getWorkspaceSessionCwd: () => '/tmp/spacezero-workspace-sessions',
      title: 'Knowledge Base Chat',
      managedContext: 'knowledge-base'
    })

    await expect(repository.findSessionById('knowledge-base-session-1')).resolves.toMatchObject({
      projectId: null,
      title: 'Knowledge Base Chat',
      managedContext: 'knowledge-base'
    })
  })

  it('resolves an Agent Definition reference before creating a workspace utility session', async () => {
    const utilityHost = {
      createSession: vi.fn(async () =>
        createState({
          kind: 'workspace',
          projectId: null,
          cwd: '/tmp/spacezero-workspace-sessions',
          agentDefinition: { id: 'scout', name: 'Scout' }
        })
      ),
      deleteSession: vi.fn(async () => undefined)
    }

    await createWorkspaceAgentSession({
      repository: createRepository(),
      utilityHost,
      createSessionId: () => 'workspace-session-1',
      readModelDefaults,
      getWorkspaceSessionCwd: () => '/tmp/spacezero-workspace-sessions',
      agentDefinition: { id: 'scout' },
      resolveAgentDefinition: async () => ({
        id: 'scout',
        name: 'Scout',
        body: 'Scout the workspace.',
        tools: ['workspace.getStatus']
      })
    })

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workspace',
        agentDefinition: {
          id: 'scout',
          name: 'Scout',
          body: 'Scout the workspace.',
          tools: ['workspace.getStatus']
        }
      })
    )
  })

  it('creates a utility session with app-owned cwd and persists projectId null', async () => {
    const utilityHost = {
      createSession: vi.fn(async () =>
        createState({
          kind: 'workspace',
          projectId: null,
          cwd: '/tmp/spacezero-workspace-sessions'
        })
      ),
      deleteSession: vi.fn(async () => undefined)
    }
    const repository = createRepository()

    await expect(
      createWorkspaceAgentSession({
        repository,
        utilityHost,
        createSessionId: () => 'workspace-session-1',
        readModelDefaults,
        getWorkspaceSessionCwd: () => '/tmp/spacezero-workspace-sessions'
      })
    ).resolves.toMatchObject({
      id: 'workspace-session-1',
      kind: 'workspace',
      title: 'Workspace Session 1',
      status: 'idle'
    })

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'workspace-session-1',
        kind: 'workspace',
        projectId: null,
        cwd: '/tmp/spacezero-workspace-sessions',
        workspaceTools: expect.arrayContaining([
          expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' }),
          expect.objectContaining({
            name: 'knowledgeBase.readDocument',
            safetyLevel: 'read'
          }),
          expect.objectContaining({
            name: 'knowledgeBase.saveDocument',
            safetyLevel: 'write'
          })
        ]),
        defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
        thinkingLevel: 'high',
        delegationDefinitions: expect.arrayContaining([
          expect.objectContaining({ id: 'scout', name: 'Scout' })
        ])
      })
    )
    await expect(repository.listWorkspaceSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'workspace-session-1', projectId: null })
    ])
  })
})
