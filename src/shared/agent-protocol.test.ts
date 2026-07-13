import {
  createAgentCreateSessionCommand,
  createAgentDeleteSessionCommand,
  createAgentGetStateCommand,
  createAgentListSessionsCommand,
  createAgentPingCommand,
  createAgentPingResponse,
  createAgentResolveToolConfirmationCommand,
  createAgentSuccessResponse,
  type AgentSessionState
} from './agent-protocol'

describe('agent utility framing protocol', () => {
  it('tags ping commands and responses with a request id and session id', () => {
    const command = createAgentPingCommand('request-1', { sessionId: 'session-1' })
    const response = createAgentPingResponse('request-1', 'session-1', 1234)

    expect(command).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.ping',
      sessionId: 'session-1'
    })
    expect(response).toEqual({
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
  })

  it('tags session lifecycle commands and state responses', () => {
    const state: AgentSessionState = {
      sessionId: 'session-1',
      projectId: 'project-1',
      cwd: '/repo',
      status: 'idle',
      live: true,
      transcriptPath: '/agent/sessions/session-1.jsonl',
      modelProvider: 'faux',
      modelId: 'faux-1'
    }

    expect(
      createAgentCreateSessionCommand('request-1', {
        sessionId: 'session-1',
        projectId: 'project-1',
        cwd: '/repo'
      })
    ).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.createSession',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', projectId: 'project-1', cwd: '/repo' }
    })
    expect(createAgentGetStateCommand('request-2', { sessionId: 'session-1' })).toEqual({
      type: 'agent.command',
      requestId: 'request-2',
      command: 'agent.getState',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1' }
    })
    expect(createAgentDeleteSessionCommand('request-3', { sessionId: 'session-1' })).toEqual({
      type: 'agent.command',
      requestId: 'request-3',
      command: 'agent.deleteSession',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1' }
    })
    expect(createAgentListSessionsCommand('request-4')).toEqual({
      type: 'agent.command',
      requestId: 'request-4',
      command: 'agent.listSessions',
      sessionId: 'agent-session-list'
    })
    expect(createAgentSuccessResponse('request-5', 'session-1', state)).toEqual({
      type: 'agent.response',
      requestId: 'request-5',
      ok: true,
      sessionId: 'session-1',
      result: state
    })
    expect(createAgentSuccessResponse('request-6', 'session-1', undefined)).toEqual({
      type: 'agent.response',
      requestId: 'request-6',
      ok: true,
      sessionId: 'session-1',
      result: undefined
    })
  })

  it('tags tool confirmation answer commands with the session and call id', () => {
    expect(
      createAgentResolveToolConfirmationCommand('request-1', {
        sessionId: 'session-1',
        callId: 'call-1',
        approved: false
      })
    ).toEqual({
      type: 'agent.command',
      requestId: 'request-1',
      command: 'agent.resolveToolConfirmation',
      sessionId: 'session-1',
      payload: { sessionId: 'session-1', callId: 'call-1', approved: false }
    })
  })
})
