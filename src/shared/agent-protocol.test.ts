import { createAgentPingCommand, createAgentPingResponse } from './agent-protocol'

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
})
