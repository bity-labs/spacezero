import { describe, expect, it, vi } from 'vitest'

import type { AgentSessionState } from '../../../shared/agent-protocol'
import type { SessionsRepository, StoredSession } from '../../sessions/main/sessions.service'
import { createProjectAgentSession } from './agent-session-handler'

function createRepository(overrides: Partial<SessionsRepository> = {}): SessionsRepository {
  const sessions: StoredSession[] = []

  return {
    async listProjectSessions() {
      return sessions
    },
    async create(session) {
      sessions.push(session)
      return session
    },
    async countByProjectId(projectId) {
      return sessions.filter((session) => session.projectId === projectId).length
    },
    async projectExists(projectId) {
      return projectId === 'project-1'
    },
    async findProjectById(projectId) {
      if (projectId !== 'project-1') return undefined
      return { id: projectId, path: '/repo' }
    },
    ...overrides
  }
}

function createState(overrides: Partial<AgentSessionState> = {}): AgentSessionState {
  return {
    sessionId: 'session-1',
    projectId: 'project-1',
    cwd: '/repo',
    status: 'idle',
    transcriptPath: '/agent/sessions/session-1.jsonl',
    modelProvider: 'faux',
    modelId: 'faux-1',
    ...overrides
  }
}

describe('createProjectAgentSession', () => {
  it('derives the utility cwd from stored project metadata', async () => {
    const utilityHost = {
      createSession: vi.fn(async () => createState()),
      deleteSession: vi.fn(async () => undefined)
    }

    await expect(
      createProjectAgentSession(
        { projectId: 'project-1', cwd: '/repo/../repo' },
        { repository: createRepository(), utilityHost, createSessionId: () => 'session-1' }
      )
    ).resolves.toMatchObject({ sessionId: 'session-1', cwd: '/repo' })

    expect(utilityHost.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo'
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
          createSessionId: () => 'session-1'
        }
      )
    ).rejects.toThrow('db write failed')

    expect(utilityHost.createSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo'
    })
    expect(utilityHost.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
  })
})
