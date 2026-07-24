import { describe, expect, it } from 'vitest'

import { AgentSessionRegistry, type CreatedPiAgentSession } from './agent-session-registry'
import type { CreateAgentSessionRequest } from '../shared/agent-protocol'

function createFakeSession(overrides: Partial<CreatedPiAgentSession> = {}): CreatedPiAgentSession {
  return {
    sessionId: overrides.sessionId ?? 'pi-session-1',
    sessionFile: '/tmp/spacezero/agent/sessions/session-1.jsonl',
    isStreaming: false,
    modelProvider: 'faux',
    modelId: 'faux-1',
    thinkingLevel: 'medium',
    setModel: async () => undefined,
    setThinkingLevel: async () => undefined,
    prompt: async () => undefined,
    abort: async () => undefined,
    subscribe: () => () => undefined,
    dispose: () => {},
    getTranscriptSnapshot: () => [],
    ...overrides
  }
}

describe('AgentSessionRegistry', () => {
  it('creates an idle project-bound Pi session and exposes its transcript path', async () => {
    const registry = new AgentSessionRegistry({
      createPiSession: async (request) => {
        expect(request).toEqual({
          kind: 'project',
          projectId: 'project-1',
          sessionId: 'session-1',
          cwd: '/repo',
          transcriptPath: undefined,
          workspaceTools: undefined
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
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo',
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1',
      thinkingLevel: 'medium'
    })
    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toEqual(created)
    await expect(registry.listSessions()).resolves.toEqual([created])
  })

  it('carries the applied Agent Definition in live and dormant session state', async () => {
    const createRequests: CreateAgentSessionRequest[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          agentDefinition: request.agentDefinition
            ? { id: request.agentDefinition.id, name: request.agentDefinition.name }
            : undefined
        })
      }
    })

    await expect(
      registry.createSession({
        projectId: 'project-1',
        sessionId: 'session-1',
        cwd: '/repo-1',
        agentDefinition: {
          id: 'reviewer',
          name: 'Reviewer',
          body: 'Review code.',
          tools: ['read']
        }
      })
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      agentDefinition: { id: 'reviewer', name: 'Reviewer' }
    })

    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    await expect(registry.listSessions()).resolves.toMatchObject([
      {
        sessionId: 'session-1',
        live: false,
        agentDefinition: { id: 'reviewer', name: 'Reviewer' }
      },
      { sessionId: 'session-2', live: true }
    ])
    await registry.getState({ sessionId: 'session-1' })
    expect(createRequests.at(-1)).toMatchObject({
      sessionId: 'session-1',
      agentDefinition: { id: 'reviewer', name: 'Reviewer', body: 'Review code.', tools: ['read'] }
    })
  })

  it('includes the live Pi transcript snapshot in session state when one exists', async () => {
    const registry = new AgentSessionRegistry({
      createPiSession: async () =>
        createFakeSession({
          getTranscriptSnapshot: () => [{ role: 'user', content: 'Hello again', timestamp: 100 }]
        })
    })

    const created = await registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo'
    })

    expect(created.transcriptSnapshot).toEqual([
      { role: 'user', content: 'Hello again', timestamp: 100 }
    ])
    await expect(registry.getState({ sessionId: 'session-1' })).resolves.toMatchObject({
      transcriptSnapshot: [{ role: 'user', content: 'Hello again', timestamp: 100 }]
    })
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
    await expect(registry.getState({ sessionId: 'session-1' })).rejects.toThrow(
      'agent.sessionNotFound'
    )
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

    const createPromise = registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo'
    })
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

  it('disposes an in-flight created Pi session when the registry is disposed', async () => {
    let resolveCreate: ((session: CreatedPiAgentSession) => void) | undefined
    let createStarted: (() => void) | undefined
    const createStartedPromise = new Promise<void>((resolve) => {
      createStarted = resolve
    })
    let disposed = false
    const registry = new AgentSessionRegistry({
      createPiSession: async () => {
        createStarted?.()
        return new Promise<CreatedPiAgentSession>((resolve) => {
          resolveCreate = resolve
        })
      }
    })

    const createPromise = registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo'
    })
    await createStartedPromise
    registry.dispose()

    resolveCreate?.(
      createFakeSession({
        dispose: () => {
          disposed = true
        }
      })
    )

    await expect(createPromise).rejects.toThrow('agent.sessionRegistryDisposed')
    expect(disposed).toBe(true)
    await expect(registry.listSessions()).resolves.toEqual([])
  })

  it('rejects duplicate and missing sessions', async () => {
    const registry = new AgentSessionRegistry({ createPiSession: async () => createFakeSession() })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })

    await expect(
      registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })
    ).rejects.toThrow('agent.sessionAlreadyExists')
    await expect(registry.getState({ sessionId: 'missing' })).rejects.toThrow(
      'agent.sessionNotFound'
    )
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

  it('recomputes the least recently used idle session after slow replacement creation completes', async () => {
    let resolveCreate: ((session: CreatedPiAgentSession) => void) | undefined
    let createStarted: (() => void) | undefined
    const createStartedPromise = new Promise<void>((resolve) => {
      createStarted = resolve
    })
    const disposedSessionIds: string[] = []
    let now = 0
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 2,
      now: () => ++now,
      createPiSession: async (request) => {
        if (request.sessionId === 'session-3') {
          createStarted?.()
          return new Promise<CreatedPiAgentSession>((resolve) => {
            resolveCreate = resolve
          })
        }

        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          dispose: () => disposedSessionIds.push(request.sessionId)
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    const createPromise = registry.createSession({
      projectId: 'project-3',
      sessionId: 'session-3',
      cwd: '/repo-3'
    })
    await createStartedPromise
    await registry.getState({ sessionId: 'session-1' })

    resolveCreate?.(
      createFakeSession({
        sessionId: 'session-3',
        sessionFile: '/tmp/spacezero/agent/sessions/session-3.jsonl',
        dispose: () => disposedSessionIds.push('session-3')
      })
    )
    await createPromise

    expect(disposedSessionIds).toEqual(['session-2'])
    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', live: true },
      { sessionId: 'session-2', live: false },
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
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo-1',
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      workspaceTools: undefined,
      defaultModel: { providerId: 'faux', modelId: 'faux-1' },
      thinkingLevel: 'medium'
    })
    expect(events).toEqual([
      'agent.sessionSuspended:session-1',
      'agent.sessionSuspended:session-2',
      'agent.sessionRehydrated:session-1'
    ])
  })

  it('preserves workspace and delegation tool descriptors when a suspended session is rehydrated', async () => {
    const createRequests: unknown[] = []
    const workspaceTools = [
      {
        name: 'workspace.getStatus',
        description: 'Read workspace status',
        safetyLevel: 'read' as const,
        kind: 'app-state' as const,
        domain: 'workspace' as const,
        parameters: { type: 'object', properties: {} }
      }
    ]
    const delegationDefinitions = [
      {
        id: 'scout',
        name: 'Scout',
        description: 'Researches the codebase without editing files.',
        body: 'You inspect code.',
        tools: ['read', 'grep']
      }
    ]
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo-1',
      workspaceTools,
      delegationDefinitions,
      appendSystemPrompt: ['Project Knowledge Base: /knowledge/projects/project-1']
    })
    expect(createRequests[0]).toMatchObject({ delegationDefinitions })

    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    await registry.getState({ sessionId: 'session-1' })

    expect(createRequests.at(-1)).toMatchObject({
      sessionId: 'session-1',
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      workspaceTools,
      delegationDefinitions,
      appendSystemPrompt: ['Project Knowledge Base: /knowledge/projects/project-1'],
      defaultModel: { providerId: 'faux', modelId: 'faux-1' }
    })
  })

  it('does not suspend running sessions to satisfy the live cap', async () => {
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) =>
        createFakeSession({
          sessionId: request.sessionId,
          isStreaming: request.sessionId === 'session-1'
        })
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

  it('cancels and disposes an in-flight dormant session rehydration when deletion arrives first', async () => {
    let resolveRehydrate: ((session: CreatedPiAgentSession) => void) | undefined
    let rehydrateStarted: (() => void) | undefined
    const rehydrateStartedPromise = new Promise<void>((resolve) => {
      rehydrateStarted = resolve
    })
    let disposed = false
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        if (request.sessionId === 'session-1' && request.transcriptPath) {
          rehydrateStarted?.()
          return new Promise<CreatedPiAgentSession>((resolve) => {
            resolveRehydrate = resolve
          })
        }

        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    const rehydratePromise = registry.getState({ sessionId: 'session-1' })
    await rehydrateStartedPromise
    await registry.deleteSession({ sessionId: 'session-1' })

    resolveRehydrate?.(
      createFakeSession({
        sessionId: 'session-1',
        sessionFile: '/tmp/spacezero/agent/sessions/session-1.jsonl',
        dispose: () => {
          disposed = true
        }
      })
    )

    await expect(rehydratePromise).rejects.toThrow('agent.sessionRehydrationCancelled')
    expect(disposed).toBe(true)
    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-2', live: true, status: 'idle' }
    ])
  })

  it('disposes an in-flight rehydrated Pi session when the registry is disposed', async () => {
    let resolveRehydrate: ((session: CreatedPiAgentSession) => void) | undefined
    let rehydrateStarted: (() => void) | undefined
    const rehydrateStartedPromise = new Promise<void>((resolve) => {
      rehydrateStarted = resolve
    })
    let disposed = false
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        if (request.sessionId === 'session-1' && request.transcriptPath) {
          rehydrateStarted?.()
          return new Promise<CreatedPiAgentSession>((resolve) => {
            resolveRehydrate = resolve
          })
        }

        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    const rehydratePromise = registry.getState({ sessionId: 'session-1' })
    await rehydrateStartedPromise
    registry.dispose()

    resolveRehydrate?.(
      createFakeSession({
        sessionId: 'session-1',
        sessionFile: '/tmp/spacezero/agent/sessions/session-1.jsonl',
        dispose: () => {
          disposed = true
        }
      })
    )

    await expect(rehydratePromise).rejects.toThrow('agent.sessionRegistryDisposed')
    expect(disposed).toBe(true)
    await expect(registry.listSessions()).resolves.toEqual([])
  })

  it('fails tool confirmation answers explicitly until a resolver is wired', async () => {
    const registry = new AgentSessionRegistry({ createPiSession: async () => createFakeSession() })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })

    await expect(
      registry.resolveToolConfirmation({ sessionId: 'session-1', callId: 'call-1', approved: true })
    ).rejects.toThrow('agent.toolConfirmationResolverUnavailable')
  })

  it('switches model and thinking level on one live session without changing another', async () => {
    type Selection = { provider: string; modelId: string; thinkingLevel: 'medium' | 'high' }
    const registry = new AgentSessionRegistry({
      createPiSession: async (request) => {
        const selection: Selection = {
          provider: 'anthropic',
          modelId: 'claude-sonnet',
          thinkingLevel: 'medium'
        }
        const session = createFakeSession({ sessionId: request.sessionId })
        Object.defineProperties(session, {
          modelProvider: { get: () => selection.provider },
          modelId: { get: () => selection.modelId },
          thinkingLevel: { get: () => selection.thinkingLevel }
        })
        session.setModel = async ({ provider, modelId }) => {
          selection.provider = provider
          selection.modelId = modelId
        }
        session.setThinkingLevel = async (level) => {
          selection.thinkingLevel = level as 'medium' | 'high'
        }
        return session
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    await expect(
      registry.setModel({ sessionId: 'session-1', provider: 'openai', modelId: 'gpt-5' })
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'medium'
    })
    await expect(
      registry.setThinkingLevel({ sessionId: 'session-1', level: 'high' })
    ).resolves.toMatchObject({
      sessionId: 'session-1',
      modelProvider: 'openai',
      modelId: 'gpt-5',
      thinkingLevel: 'high'
    })

    await expect(registry.getState({ sessionId: 'session-2' })).resolves.toMatchObject({
      sessionId: 'session-2',
      modelProvider: 'anthropic',
      modelId: 'claude-sonnet',
      thinkingLevel: 'medium'
    })
  })

  it('preserves per-session model and thinking overrides for a suspended Agent Definition session', async () => {
    const createRequests: CreateAgentSessionRequest[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        const selection = {
          provider:
            request.agentDefinition?.model?.providerId ??
            request.defaultModel?.providerId ??
            'faux',
          modelId:
            request.agentDefinition?.model?.modelId ?? request.defaultModel?.modelId ?? 'faux-1',
          thinkingLevel: request.agentDefinition?.thinkingLevel ?? request.thinkingLevel ?? 'medium'
        }
        const session = createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          agentDefinition: request.agentDefinition
            ? { id: request.agentDefinition.id, name: request.agentDefinition.name }
            : undefined
        })
        Object.defineProperties(session, {
          modelProvider: { get: () => selection.provider },
          modelId: { get: () => selection.modelId },
          thinkingLevel: { get: () => selection.thinkingLevel }
        })
        session.setModel = async ({ provider, modelId }) => {
          selection.provider = provider
          selection.modelId = modelId
        }
        session.setThinkingLevel = async (level) => {
          selection.thinkingLevel = level
        }
        return session
      }
    })

    await registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo-1',
      defaultModel: { providerId: 'anthropic', modelId: 'claude-sonnet' },
      thinkingLevel: 'medium',
      agentDefinition: {
        id: 'reviewer',
        name: 'Reviewer',
        body: 'Review code.',
        model: { providerId: 'faux', modelId: 'faux-1' },
        thinkingLevel: 'high'
      }
    })
    await registry.setModel({ sessionId: 'session-1', provider: 'openai', modelId: 'gpt-5' })
    await registry.setThinkingLevel({ sessionId: 'session-1', level: 'low' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    await registry.getState({ sessionId: 'session-1' })

    expect(createRequests.at(-1)).toMatchObject({
      sessionId: 'session-1',
      defaultModel: { providerId: 'openai', modelId: 'gpt-5' },
      thinkingLevel: 'low',
      agentDefinition: {
        id: 'reviewer',
        name: 'Reviewer',
        model: { providerId: 'openai', modelId: 'gpt-5' },
        thinkingLevel: 'low'
      }
    })
  })

  it('preserves the selected model when a suspended session is rehydrated', async () => {
    const createRequests: unknown[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        const selection = {
          provider: request.defaultModel?.providerId ?? 'anthropic',
          modelId: request.defaultModel?.modelId ?? 'claude-sonnet-4'
        }
        const session = createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
        Object.defineProperties(session, {
          modelProvider: { get: () => selection.provider },
          modelId: { get: () => selection.modelId }
        })
        session.setModel = async ({ provider, modelId }) => {
          selection.provider = provider
          selection.modelId = modelId
        }
        return session
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.setModel({ sessionId: 'session-1', provider: 'openai', modelId: 'gpt-5' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    await registry.getState({ sessionId: 'session-1' })

    expect(createRequests.at(-1)).toMatchObject({
      sessionId: 'session-1',
      defaultModel: { providerId: 'openai', modelId: 'gpt-5' }
    })
  })

  it('preserves disabled global skills when a suspended session is rehydrated', async () => {
    const createRequests: CreateAgentSessionRequest[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`
        })
      }
    })

    await registry.createSession({
      projectId: 'project-1',
      sessionId: 'session-1',
      cwd: '/repo-1',
      disabledGlobalSkillPaths: ['/Users/tiby/.agents/skills/review/SKILL.md']
    })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })
    await registry.getState({ sessionId: 'session-1' })

    expect(createRequests.at(-1)).toMatchObject({
      sessionId: 'session-1',
      disabledGlobalSkillPaths: ['/Users/tiby/.agents/skills/review/SKILL.md']
    })
  })

  it('prompts and aborts an existing Pi session', async () => {
    let prompted = ''
    let aborted = false
    const registry = new AgentSessionRegistry({
      createPiSession: async () =>
        createFakeSession({
          prompt: async (message) => {
            prompted = message
          },
          abort: async () => {
            aborted = true
          }
        })
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo' })
    await registry.prompt({ sessionId: 'session-1', message: '  hello agent  ' })
    await registry.abort({ sessionId: 'session-1' })

    expect(prompted).toBe('hello agent')
    expect(aborted).toBe(true)
  })

  it('rehydrates a suspended session before prompting it', async () => {
    const createRequests: unknown[] = []
    const prompts: string[] = []
    const registry = new AgentSessionRegistry({
      maxLiveSessions: 1,
      createPiSession: async (request) => {
        createRequests.push(request)
        return createFakeSession({
          sessionId: request.sessionId,
          sessionFile: `/tmp/spacezero/agent/sessions/${request.sessionId}.jsonl`,
          prompt: async (message) => {
            prompts.push(`${request.sessionId}:${message}`)
          }
        })
      }
    })

    await registry.createSession({ projectId: 'project-1', sessionId: 'session-1', cwd: '/repo-1' })
    await registry.createSession({ projectId: 'project-2', sessionId: 'session-2', cwd: '/repo-2' })

    await registry.prompt({ sessionId: 'session-1', message: '  continue work  ' })

    expect(createRequests.at(-1)).toEqual({
      sessionId: 'session-1',
      kind: 'project',
      projectId: 'project-1',
      cwd: '/repo-1',
      transcriptPath: '/tmp/spacezero/agent/sessions/session-1.jsonl',
      workspaceTools: undefined,
      defaultModel: { providerId: 'faux', modelId: 'faux-1' },
      thinkingLevel: 'medium'
    })
    expect(prompts).toEqual(['session-1:continue work'])
    await expect(registry.listSessions()).resolves.toMatchObject([
      { sessionId: 'session-1', live: true },
      { sessionId: 'session-2', live: false }
    ])
  })

  it('forwards streaming events with the Space Zero session id when the Pi session id differs', async () => {
    const events: unknown[] = []
    let listener: ((event: { type: 'agent_start'; sessionId: string }) => void) | undefined
    const registry = new AgentSessionRegistry({
      createPiSession: async () =>
        createFakeSession({
          sessionId: 'pi-internal-session-1',
          subscribe: (next) => {
            listener = next
            return () => undefined
          }
        }),
      onStreamingEvent: (event) => events.push(event)
    })

    await registry.createSession({
      projectId: 'project-1',
      sessionId: 'spacezero-session-1',
      cwd: '/repo'
    })
    listener?.({ type: 'agent_start', sessionId: 'pi-internal-session-1' })

    expect(events).toEqual([{ type: 'agent_start', sessionId: 'spacezero-session-1' }])
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
