import { describe, expect, it } from 'vitest'

import { AgentSessionRegistry, type CreatedPiAgentSession } from './agent-session-registry'

function createFakeSession(overrides: Partial<CreatedPiAgentSession> = {}): CreatedPiAgentSession {
  return {
    sessionId: overrides.sessionId ?? 'pi-session-1',
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
        expect(request).toEqual({
          projectId: 'project-1',
          sessionId: 'session-1',
          cwd: '/repo',
          transcriptPath: undefined
        })
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
      live: true,
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1'
    })
    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toEqual(created)
    await expect(registry.listSessions()).resolves.toEqual([created])
  })

  it('keeps multiple live sessions independent and reports each running or idle status', async () => {
    const registry = new AgentSessionRegistry({
      createPiSession: async (request) =>
        createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          isStreaming: request.sessionId === 'session-1'
        })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', status: 'running', live: true, cwd: '/repo-1' },
      { sessionId: 'session-2', status: 'idle', live: true, cwd: '/repo-2' }
    ])
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

  it('suspends the least recently used idle session when the live session cap is reached', async () => {
    const disposedSessionIds: string[] = []
    const events: string[] = []
    let now = 0
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 2,
      now: () => ++now,
      onEvent: (event) => events.push(`${event.event}:${event.sessionId}`),
      createPiSession: async (request) =>
        createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          dispose: () => disposedSessionIds.push(request.sessionId)
        })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    await registry.getState({ sessionId: 'session-2' })
    await registry.createSession({ projectId: 'project-3', sessionId: 'session-3', cwd: '/repo-3' })

    expect(disposedSessionIds).toEqual(['session-1'])
    expect(events).toEqual(['agent.sessionSuspended:session-1'])
    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', live: false, status: 'idle' },
      { sessionId: 'session-2', live: true },
      { sessionId: 'session-3', live: true }
    ])
  })

  it('rehydrates a suspended session from its transcript path when summoned', async () => {
    const createRequests: unknown[] = []
    const events: string[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      onEvent: (event) => events.push(`${event.event}:${event.sessionId}`),
      createPiSession: async (request) => {
        createRequests.push(request)
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toMatchObject({
      sessionId: 'session-1',
      live: true
    })
    expect(createRequests.at(-1)).toEqual({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo-1',
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl'
    })
    expect(events).toEqual([
      'agent.sessionSuspended:session-1',
      'agent.sessionSuspended:session-2',
      'agent.sessionRehydrated:session-1'
    ])
  })

  it('does not suspend running sessions to satisfy the live cap', async () => {
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) =>
        createFakeSession({ sessionId: request.sessionId, isStreaming: request.sessionId === 'session-1' })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })

    await expect(
      registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    ).rejects.toThrow('agent.concurrentSessionLimitReached')
  })

  it('enforces the live cap when create requests arrive concurrently', async () => {
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        await Promise.resolve()
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await Promise.all([
      registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' }),
      registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    ])

    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', live: false, status: 'idle' },
      { sessionId: 'session-2', live: true, status: 'idle' }
    ])
  })

  it('keeps the existing live session active when creating a replacement fails', async () => {
    const disposedSessionIds: string[] = []
    const events: string[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      onEvent: (event) => events.push(`${event.event}:${event.sessionId}`),
      createPiSession: async (request) => {
        if (request.sessionId === 'session-2') throw new Error('agent.createFailed')
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          dispose: () => disposedSessionIds.push(request.sessionId)
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })

    await expect(
      registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    ).rejects.toThrow('agent.createFailed')

    expect(disposedSessionIds).toEqual([])
    expect(events).toEqual([])
    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', live: true, status: 'idle' }
    ])
  })
})
