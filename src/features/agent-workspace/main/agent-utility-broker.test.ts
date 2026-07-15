import type { AgentSessionState, AgentUtilityFrame } from '../../../shared/agent-protocol'
import { AgentUtilityBroker, type AgentUtilityPort } from './agent-utility-broker'

class FakeAgentUtilityPort implements AgentUtilityPort {
  postedFrames: AgentUtilityFrame[] = []
  private messageHandler: ((frame: AgentUtilityFrame) => void) | undefined
  private closeHandler: (() => void) | undefined

  postMessage(frame: AgentUtilityFrame): void {
    this.postedFrames.push(frame)
  }

  onMessage(handler: (frame: AgentUtilityFrame) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  emit(frame: AgentUtilityFrame): void {
    this.messageHandler?.(frame)
  }

  close(): void {
    this.closeHandler?.()
  }
}

describe('AgentUtilityBroker', () => {
  it('round-trips a session-tagged ping command through the utility port', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    expect(port.postedFrames).toEqual([
      {
        type: 'agent.command',
        requestId: 'request-1',
        command: 'agent.ping',
        sessionId: 'session-1'
      }
    ])

    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: true,
      sessionId: 'session-1',
      result: {
        sessionId: 'session-1',
        message: 'pong-from-agent-utility',
        utilityProcessId: 1234
      }
    })

    await expect(pingPromise).resolves.toEqual({
      sessionId: 'session-1',
      message: 'pong-from-agent-utility',
      utilityProcessId: 1234
    })
  })

  it('creates an agent session, reads its state, and lists live sessions through session-tagged utility commands', async () => {
    const port = new FakeAgentUtilityPort()
    let requestNumber = 0
    const broker = new AgentUtilityBroker(port, { createRequestId: () => `request-${++requestNumber}` })

    const createdSession: AgentSessionState = {
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo',
      status: 'idle',
      live: true,
      transcriptPath: '/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1',
      thinkingLevel: 'medium'
    }

    const createPromise = broker.createSession({
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo'
    })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.createSession',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', projectId: 'project-1', cwd: '/repo' }
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: true,
      sessionId: 'session-1',
      result: createdSession
    })
    await expect(createPromise).resolves.toEqual(createdSession)

    const deletePromise = broker.deleteSession({ sessionId: 'session-1' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-2',
      command: 'agent.deleteSession',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1' }
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-2',
      ok: true,
      sessionId: 'session-1',
      result: undefined
    })
    await expect(deletePromise).resolves.toBeUndefined()

    const statePromise = broker.getState({ sessionId: 'session-1' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-3',
      command: 'agent.getState',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1' }
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-3',
      ok: true,
      sessionId: 'session-1',
      result: createdSession
    })
    await expect(statePromise).resolves.toEqual(createdSession)

    const listPromise = broker.listSessions()
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-4',
      command: 'agent.listSessions',
      sessionId: 'agent-session-list'
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-4',
      ok: true,
      sessionId: 'agent-session-list',
      result: [createdSession]
    })
    await expect(listPromise).resolves.toEqual([createdSession])
  })

  it('prompts, aborts, and relays streaming events by session id', async () => {
    const port = new FakeAgentUtilityPort()
    let requestNumber = 0
    const events: unknown[] = []
    const broker = new AgentUtilityBroker(port, { createRequestId: () => `request-${++requestNumber}` })
    broker.onEvent((event) => events.push(event))

    const promptPromise = broker.prompt({ sessionId: 'session-1', message: 'Hello' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.prompt',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', message: 'Hello' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-1', ok: true, sessionId: 'session-1', result: undefined })
    await expect(promptPromise).resolves.toBeUndefined()

    port.emit({
      type: 'agent.event',
      event: 'agent.streaming',
      sessionId: 'session-1',
      payload: {
        type: 'message_update',
        sessionId: 'session-1',
        messageId: 'message-1',
        delta: 'Hi'
      }
    })

    const abortPromise = broker.abort({ sessionId: 'session-1' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-2',
      command: 'agent.abort',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-2', ok: true, sessionId: 'session-1', result: undefined })
    await expect(abortPromise).resolves.toBeUndefined()

    expect(events).toEqual([{ type: 'message_update', sessionId: 'session-1', messageId: 'message-1', delta: 'Hi' }])
  })

  it('routes session-tagged utility events without resolving pending requests', async () => {
    const port = new FakeAgentUtilityPort()
    const events: AgentUtilityFrame[] = []
    const streamingEvents: unknown[] = []
    const broker = new AgentUtilityBroker(port, {
      createRequestId: () => 'request-1',
      onEvent: (event) => events.push(event)
    })
    broker.onEvent((event) => streamingEvents.push(event))

    const suspendedSession: AgentSessionState = {
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo',
      status: 'idle',
      live: false,
      transcriptPath: '/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1',
      thinkingLevel: 'medium'
    }

    port.emit({
      type: 'agent.event',
      event: 'agent.sessionSuspended',
      sessionId: 'session-1',
      payload: suspendedSession
    })

    expect(events).toEqual([
      {
        type: 'agent.event',
        event: 'agent.sessionSuspended',
        sessionId: 'session-1',
        payload: suspendedSession
      }
    ])
    expect(streamingEvents).toEqual([])
  })

  it('routes projection events from the utility to the dedicated projection handler', () => {
    const port = new FakeAgentUtilityPort()
    const projectionEvents: AgentUtilityFrame[] = []
    new AgentUtilityBroker(port, {
      createRequestId: () => 'request-1',
      onProjectionEvent: (event) => projectionEvents.push(event)
    })

    port.emit({
      type: 'agent.sessionProjectionEvent',
      event: {
        type: 'snapshot',
        sessionId: 'session-1',
        seq: 1,
        snapshot: { status: 'idle', messages: [] }
      }
    })

    expect(projectionEvents).toEqual([
      {
        type: 'agent.sessionProjectionEvent',
        event: {
          type: 'snapshot',
          sessionId: 'session-1',
          seq: 1,
          snapshot: { status: 'idle', messages: [] }
        }
      }
    ])
  })

  it('brokers API-key auth commands without exposing credentials in status responses', async () => {
    const port = new FakeAgentUtilityPort()
    let requestNumber = 0
    const broker = new AgentUtilityBroker(port, { createRequestId: () => `request-${++requestNumber}` })

    const addPromise = broker.addApiKey({ providerId: 'anthropic', apiKey: 'sk-secret' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.addApiKey',
      sessionId: 'agent-auth',
      payload: { providerId: 'anthropic', apiKey: 'sk-secret' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-1', ok: true, sessionId: 'agent-auth', result: undefined })
    await expect(addPromise).resolves.toBeUndefined()

    const statusPromise = broker.getAuthStatus()
    port.emit({
      type: 'agent.response',
      requestId: 'request-2',
      ok: true,
      sessionId: 'agent-auth',
      result: {
        subscriptions: { connected: [], availableProviders: [] },
        apiKeys: {
          configured: [{ providerId: 'anthropic', label: 'Anthropic', configured: true, source: 'stored', removable: true }],
          availableProviders: [{ providerId: 'anthropic', label: 'Anthropic' }]
        }
      }
    })
    const status = await statusPromise
    expect(status.apiKeys.configured[0]).toMatchObject({ providerId: 'anthropic', configured: true })
    expect(JSON.stringify(status)).not.toContain('sk-secret')

    const removePromise = broker.removeApiKey({ providerId: 'anthropic' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-3',
      command: 'agent.removeApiKey',
      sessionId: 'agent-auth',
      payload: { providerId: 'anthropic' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-3', ok: true, sessionId: 'agent-auth', result: undefined })
    await expect(removePromise).resolves.toBeUndefined()
  })

  it('routes model and thinking-level changes to the utility as session-tagged commands', async () => {
    const port = new FakeAgentUtilityPort()
    let requestNumber = 0
    const broker = new AgentUtilityBroker(port, { createRequestId: () => `request-${++requestNumber}` })

    const modelPromise = broker.setModel({ sessionId: 'session-1', provider: 'anthropic', modelId: 'claude-sonnet' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.setModel',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', provider: 'anthropic', modelId: 'claude-sonnet' }
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: true,
      sessionId: 'session-1',
      result: {
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: '/repo',
        status: 'idle',
        live: true,
        transcriptPath: '/agent/sessions/session-1.jsonl',
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet',
        thinkingLevel: 'medium'
      }
    })
    await expect(modelPromise).resolves.toMatchObject({ modelProvider: 'anthropic', modelId: 'claude-sonnet' })

    const thinkingPromise = broker.setThinkingLevel({ sessionId: 'session-1', level: 'high' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-2',
      command: 'agent.setThinkingLevel',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', level: 'high' }
    })
    port.emit({
      type: 'agent.response',
      requestId: 'request-2',
      ok: true,
      sessionId: 'session-1',
      result: {
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: '/repo',
        status: 'idle',
        live: true,
        transcriptPath: '/agent/sessions/session-1.jsonl',
        modelProvider: 'anthropic',
        modelId: 'claude-sonnet',
        thinkingLevel: 'high'
      }
    })
    await expect(thinkingPromise).resolves.toMatchObject({ thinkingLevel: 'high' })
  })

  it('routes tool confirmation answers to the utility as session-tagged commands', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const answerPromise = broker.resolveToolConfirmation({
      sessionId: 'session-1',
      callId: 'call-1',
      approved: true
    })

    expect(port.postedFrames).toEqual([
      {
        type: 'agent.command',
        requestId: 'request-1',
        command: 'agent.resolveToolConfirmation',
        sessionId: 'session-1',
        payload: { sessionId: 'session-1', callId: 'call-1', approved: true }
      }
    ])

    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: true,
      sessionId: 'session-1',
      result: undefined
    })

    await expect(answerPromise).resolves.toBeUndefined()
  })

  it('executes Workspace Tool proxy commands from the utility through main', async () => {
    const port = new FakeAgentUtilityPort()
    const executeWorkspaceTool = vi.fn(async () => ({ ok: true as const, data: { status: 'ready' } }))
    new AgentUtilityBroker(port, { executeWorkspaceTool })

    port.emit({
      type: 'agent.command',
      requestId: 'tool-request-1',
      command: 'workspaceTool.execute',
      sessionId: 'session-1',
      payload: {
        sessionId: 'session-1',
        toolName: 'workspace.getStatus',
        input: {},
        safetyLevel: 'read',
        callId: 'call-1'
      }
    })

    await vi.waitFor(() => {
      expect(port.postedFrames).toContainEqual({
        type: 'agent.response',
        requestId: 'tool-request-1',
        ok: true,
        sessionId: 'session-1',
        result: { ok: true, data: { status: 'ready' } }
      })
    })
    expect(executeWorkspaceTool).toHaveBeenCalledWith({
      sessionId: 'session-1',
      toolName: 'workspace.getStatus',
      input: {},
      safetyLevel: 'read',
      callId: 'call-1'
    })
  })

  it('rejects a pending command when the utility reports a failure', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: false,
      sessionId: 'session-1',
      error: {
        code: 'agent.unknownCommand',
        message: 'Unknown command'
      }
    })

    await expect(pingPromise).rejects.toThrow('Unknown command')
  })

  it('rejects pending commands when the broker is disposed', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    broker.dispose(new Error('agent.utilityExited:1'))

    await expect(pingPromise).rejects.toThrow('agent.utilityExited:1')
  })

  it('rejects pending commands when the utility port closes', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    port.close()

    await expect(pingPromise).rejects.toThrow('agent.utilityPortClosed')
  })

  it('does not time out a long-running prompt while the utility turn is still active', async () => {
    vi.useFakeTimers()

    try {
      const port = new FakeAgentUtilityPort()
      const broker = new AgentUtilityBroker(port, {
        createRequestId: () => 'request-1',
        requestTimeoutMs: 10,
        sessionLifecycleTimeoutMs: 50
      })

      const promptPromise = broker.prompt({ sessionId: 'session-1', message: 'Implement the issue' })
      const rejectionSpy = vi.fn()
      promptPromise.catch(rejectionSpy)

      vi.advanceTimersByTime(60)
      await Promise.resolve()

      expect(rejectionSpy).not.toHaveBeenCalled()

      port.emit({ type: 'agent.response', requestId: 'request-1', ok: true, sessionId: 'session-1', result: undefined })
      await expect(promptPromise).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects pending commands when the utility does not answer before the timeout', async () => {
    vi.useFakeTimers()

    try {
      const port = new FakeAgentUtilityPort()
      const broker = new AgentUtilityBroker(port, {
        createRequestId: () => 'request-1',
        requestTimeoutMs: 50
      })

      const pingPromise = broker.ping({ sessionId: 'session-1' })

      vi.advanceTimersByTime(50)

      await expect(pingPromise).rejects.toThrow('agent.utilityRequestTimedOut')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects OAuth login when the utility does not finish before the lifecycle timeout', async () => {
    vi.useFakeTimers()

    try {
      const port = new FakeAgentUtilityPort()
      const broker = new AgentUtilityBroker(port, {
        createRequestId: () => 'request-1',
        requestTimeoutMs: 10,
        oauthLoginTimeoutMs: 50
      })

      const loginPromise = broker.loginOAuth({ providerId: 'claude' })

      vi.advanceTimersByTime(50)

      await expect(loginPromise).rejects.toThrow('agent.utilityRequestTimedOut')
    } finally {
      vi.useRealTimers()
    }
  })

  it('brokers OAuth login, browser open requests, callbacks, and logout', async () => {
    const port = new FakeAgentUtilityPort()
    let requestNumber = 0
    const openExternal = vi.fn(async () => undefined)
    const broker = new AgentUtilityBroker(port, {
      createRequestId: () => `request-${++requestNumber}`,
      openExternal
    })

    const loginPromise = broker.loginOAuth({ providerId: 'claude' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.loginOAuth',
      sessionId: 'agent-auth',
      payload: { providerId: 'claude' }
    })

    port.emit({
      type: 'agent.command',
      requestId: 'utility-request-1',
      command: 'agent.openOAuthUrl',
      sessionId: 'agent-auth',
      payload: { url: 'https://provider.example/authorize' }
    })
    await expect(openExternal).toHaveBeenCalledWith('https://provider.example/authorize')
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.response',
      requestId: 'utility-request-1',
      ok: true,
      sessionId: 'agent-auth',
      result: undefined
    })

    const callbackPromise = broker.handleOAuthCallback({ url: 'spacezero://oauth/claude?code=abc' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-2',
      command: 'agent.handleOAuthCallback',
      sessionId: 'agent-auth',
      payload: { url: 'spacezero://oauth/claude?code=abc' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-2', ok: true, sessionId: 'agent-auth', result: { handled: true } })
    await expect(callbackPromise).resolves.toEqual({ handled: true })

    port.emit({ type: 'agent.response', requestId: 'request-1', ok: true, sessionId: 'agent-auth', result: undefined })
    await expect(loginPromise).resolves.toBeUndefined()

    const logoutPromise = broker.logoutOAuth({ providerId: 'claude' })
    expect(port.postedFrames.at(-1)).toEqual({
      type: 'agent.command',
      requestId: 'request-3',
      command: 'agent.logoutOAuth',
      sessionId: 'agent-auth',
      payload: { providerId: 'claude' }
    })
    port.emit({ type: 'agent.response', requestId: 'request-3', ok: true, sessionId: 'agent-auth', result: undefined })
    await expect(logoutPromise).resolves.toBeUndefined()
  })

  it('uses a lifecycle timeout for session creation and requests cleanup after timeout', async () => {
    vi.useFakeTimers()

    try {
      const port = new FakeAgentUtilityPort()
      let requestNumber = 0
      const broker = new AgentUtilityBroker(port, {
        createRequestId: () => `request-${++requestNumber}`,
        requestTimeoutMs: 10,
        sessionLifecycleTimeoutMs: 50
      })

      const createPromise = broker.createSession({
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: '/repo'
      })

      vi.advanceTimersByTime(10)
      expect(port.postedFrames).toHaveLength(1)

      vi.advanceTimersByTime(40)

      await expect(createPromise).rejects.toThrow('agent.utilityRequestTimedOut')
      expect(port.postedFrames.at(-1)).toEqual({
        type: 'agent.command',
        requestId: 'request-2',
        command: 'agent.deleteSession',
        sessionId: 'session-1',
        payload: { sessionId: 'session-1' }
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
