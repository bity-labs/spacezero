import { describe, expect, it } from 'vitest'

import { AgentSessionRegistry, type CreatedPiAgentSession } from './agent-session-registry'

function createFakeSession(overrides: Partial<CreatedPiAgentSession> = {}): CreatedPiAgentSession {
  return {
    sessionId: 'pi-session-1',
    sessionFile: '/tmp/spacezero/agent/sessions/session-1.jsonl',
    isStreaming: false,
    modelProvider: 'faux',
    modelId: 'faux-1',
    dispose: () => {},
    ...overrides
  }
}

describe('AgentSessionRegistry', () => {
  it('creates an idle project-bound Pi session and exposes its transcript path', async () => {
    const registry = new AgentSessionRegistry({
      createPiSession: async (request) => {
        expect(request).toEqual({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })
        return createFakeSession()
      }
    })

    const created = await registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo'
    })

    expect(created).toEqual({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo',
      status: 'idle',
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1'
    })
    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toEqual(created)
    await expect(registry.listSessions()).resolves.toEqual([created])
  })

  it('reports running state when the underlying Pi session is streaming', async () => {
    const registry = new AgentSessionRegistry({
      createPiSession: async () => createFakeSession({ isStreaming: true })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })

    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toMatchObject({
      status: 'running'
    })
  })

  it('deletes a session and disposes the underlying Pi session', async () => {
    let disposed = false
    const registry = new AgentSessionRegistry({
      createPiSession: async () =>
        createFakeSession({
          dispose: () => {
            disposed = true
          }
        })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })

    await registry.deleteSession({ sessionId: 'session-1' })

    expect(disposed).toBe(true)
    await expect(registry.listSessions()).resolves.toEqual([])
    await expect(registry.getState({ sessionId: 'session-1' })).rejects.toThrow('agent.sessionNotFound')
  })

  it('cancels and disposes an in-flight session when deletion arrives before creation completes', async () => {
    let resolveCreate: ((session: CreatedPiAgentSession) => void) | undefined
    let disposed = false
    const registry = new AgentSessionRegistry({
      createPiSession: async () =>
        new Promise<CreatedPiAgentSession>((resolve) => {
          resolveCreate = resolve
        })
    })

    const createPromise = registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })
    await registry.deleteSession({ sessionId: 'session-1' })

    resolveCreate?.(
      createFakeSession({
        dispose: () => {
          disposed = true
        }
      })
    )

    await expect(createPromise).rejects.toThrow('agent.sessionCreationCancelled')
    expect(disposed).toBe(true)
    await expect(registry.listSessions()).resolves.toEqual([])
  })

  it('rejects duplicate and missing sessions', async () => {
    const registry = new AgentSessionRegistry({ createPiSession: async () => createFakeSession() })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })

    await expect(
      registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })
    ).rejects.toThrow('agent.sessionAlreadyExists')
    await expect(registry.getState({ sessionId: 'missing' })).rejects.toThrow('agent.sessionNotFound')
  })
})
