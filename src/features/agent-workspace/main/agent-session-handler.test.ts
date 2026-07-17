import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import {
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

describe('createProjectAgentSession', () => {
  it('derives the utility cwd from stored project metadata', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/repo/../repo' },
        { repository: createRepository(), utilityHost, createSessionId: () => 'session-1', readModelDefaults }
      )
    ).resolves.toMatchObject({ sessionId: 'session-1', cwd: '/repo' })

    expect(utilityHost.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo',
      workspaceTools: expect.arrayContaining([
        expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
      ]),
      appendSystemPrompt: [expect.stringContaining('not configured')],
      defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
      thinkingLevel: 'high'
    })
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
        createSessionId: () => 'session-1',
        readModelDefaults,
        getKnowledgeBaseStatus: getConfiguredKnowledgeBaseStatus
      }
    )

    expect(utilityHost.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appendSystemPrompt: [
          expect.stringContaining(
            '/home/builder/SpaceZero/knowledge-base/projects/space-zero'
          )
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

  it('rejects a renderer-supplied cwd that does not match the stored project path', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/tmp/not-this-project' },
        { repository: createRepository(), utilityHost, createSessionId: () => 'session-1' }
      )
    ).rejects.toThrow('Session cwd must match the project path')

    expect(utilityHost.createSession).not.toHaveBeenCalled()
  })

  it('cleans up the live utility session when session metadata persistence fails', async () => {
    const persistenceError = new Error('db write failed')
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
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
          createSessionId: () => 'session-1',
          readModelDefaults
        }
      )
    ).rejects.toThrow('db write failed')

    expect(utilityHost.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo',
      workspaceTools: expect.arrayContaining([
        expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
      ]),
      appendSystemPrompt: [expect.stringContaining('not configured')],
      defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
      thinkingLevel: 'high'
    })
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
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

    await expect(Promise.all([firstRestore, secondRestore])).resolves.toEqual([createState(), createState()])
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

    expect(utilityHost.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo',
      transcriptPath: '/agent/sessions/session-1.jsonl',
      workspaceTools: expect.arrayContaining([
        expect.objectContaining({ name: 'workspace.getStatus', safetyLevel: 'read' })
      ]),
      appendSystemPrompt: [expect.stringContaining('not configured')],
      thinkingLevel: undefined
    })
  })
})

describe('createWorkspaceAgentSession', () => {
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

    expect(utilityHost.createSession).toHaveBeenCalledWith({
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
      thinkingLevel: 'high'
    })
    await expect(repository.listWorkspaceSessions()).resolves.toEqual([
      expect.objectContaining({ id: 'workspace-session-1', projectId: null })
    ])
  })
})
