import { describe, expect, it } from 'vitest'

import { createAgentSessionProjectionSequencer } from './agent-projection-sequencer'

describe('agent session projection sequencer', () => {
  it('assigns one monotonic sequence across utility and main-originated events', () => {
    const sequencer = createAgentSessionProjectionSequencer()

    expect(
      sequencer.next({ type: 'agent_start', sessionId: 'session-1', seq: 1 })
    ).toEqual({ type: 'agent_start', sessionId: 'session-1', seq: 1 })
    expect(
      sequencer.next({
        type: 'tool_confirmation_request',
        sessionId: 'session-1',
        request: {
          sessionId: 'session-1',
          callId: 'call-1',
          toolName: 'workspace.updateProject',
          summary: 'Rename the project.'
        }
      })
    ).toMatchObject({ type: 'tool_confirmation_request', sessionId: 'session-1', seq: 2 })
    expect(
      sequencer.next({ type: 'message_update', sessionId: 'session-1', seq: 2, message: { role: 'assistant', content: [], timestamp: 100 } })
    ).toMatchObject({ type: 'message_update', sessionId: 'session-1', seq: 3 })
  })

  it('keeps sequences independent per session', () => {
    const sequencer = createAgentSessionProjectionSequencer()

    expect(sequencer.next({ type: 'agent_start', sessionId: 'session-1', seq: 10 }).seq).toBe(1)
    expect(sequencer.next({ type: 'agent_start', sessionId: 'session-2', seq: 10 }).seq).toBe(1)
    expect(sequencer.next({ type: 'agent_end', sessionId: 'session-1', seq: 11 }).seq).toBe(2)
  })
})
