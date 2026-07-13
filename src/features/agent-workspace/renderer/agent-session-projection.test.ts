import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'
import {
  createAgentSessionProjectionState,
  projectAgentSessionMessages,
  reduceAgentSessionProjectionState
} from './agent-session-projection'

describe('agent session projection reducer', () => {
  it('uses snapshots as the authoritative transcript and clears transient tool output', () => {
    const initial = createAgentSessionProjectionState('session-1')
    const streaming = reduceAgentSessionProjectionState(initial, {
      type: 'tool_execution_update',
      sessionId: 'session-1',
      seq: 1,
      toolCallId: 'call-1',
      toolName: 'workspace.getStatus',
      partialResult: { content: [{ type: 'text', text: 'partial' }] }
    })

    const snapshot: AgentSessionProjectionEvent = {
      type: 'snapshot',
      sessionId: 'session-1',
      seq: 2,
      snapshot: {
        status: 'idle',
        messages: [{ role: 'user', content: 'Hello', timestamp: 100 }],
        toolConfirmationRequests: []
      }
    }

    const next = reduceAgentSessionProjectionState(streaming, snapshot)

    expect(next.messages).toEqual(snapshot.snapshot.messages)
    expect(next.toolExecutions).toEqual({})
    expect(next.status).toBe('idle')
    expect(next.lastSeq).toBe(2)
  })

  it('ignores stale non-snapshot events by sequence number', () => {
    const state = reduceAgentSessionProjectionState(createAgentSessionProjectionState('session-1'), {
      type: 'agent_start',
      sessionId: 'session-1',
      seq: 2
    })

    const next = reduceAgentSessionProjectionState(state, {
      type: 'agent_end',
      sessionId: 'session-1',
      seq: 1
    })

    expect(next).toBe(state)
    expect(next.status).toBe('running')
  })

  it('merges maximal assistant and tool-result runs into one UI assistant message', () => {
    const state = reduceAgentSessionProjectionState(createAgentSessionProjectionState('session-1'), {
      type: 'snapshot',
      sessionId: 'session-1',
      seq: 1,
      snapshot: {
        status: 'idle',
        messages: [
          { role: 'user', content: 'Check status', timestamp: 100 },
          {
            role: 'assistant',
            timestamp: 101,
            content: [
              { type: 'text', text: 'I will check. ' },
              {
                type: 'toolCall',
                id: 'call-1',
                name: 'workspace.getStatus',
                arguments: { scope: 'workspace' }
              }
            ],
            stopReason: 'toolUse'
          },
          {
            role: 'toolResult',
            timestamp: 102,
            toolCallId: 'call-1',
            toolName: 'workspace.getStatus',
            content: [{ type: 'text', text: 'ok' }],
            isError: false
          },
          {
            role: 'assistant',
            timestamp: 103,
            content: [{ type: 'text', text: 'Workspace is healthy.' }],
            stopReason: 'stop'
          }
        ]
      }
    })

    expect(projectAgentSessionMessages(state)).toEqual([
      {
        id: 'agent-msg:0',
        role: 'user',
        createdAt: '1970-01-01T00:00:00.100Z',
        parts: [{ type: 'text', text: 'Check status' }]
      },
      {
        id: 'agent-msg:1',
        role: 'assistant',
        createdAt: '1970-01-01T00:00:00.101Z',
        status: 'complete',
        parts: [
          { type: 'text', text: 'I will check. ' },
          {
            type: 'tool-call',
            callId: 'call-1',
            toolName: 'workspace.getStatus',
            state: 'success',
            input: { scope: 'workspace' },
            output: 'ok'
          },
          { type: 'text', text: 'Workspace is healthy.' }
        ]
      }
    ])
  })

  it('projects main-routed workspace tool confirmation requests inline with the matching tool call', () => {
    const state = reduceAgentSessionProjectionState(createAgentSessionProjectionState('session-1'), {
      type: 'snapshot',
      sessionId: 'session-1',
      seq: 1,
      snapshot: {
        status: 'running',
        messages: [
          {
            role: 'assistant',
            timestamp: 100,
            content: [
              {
                type: 'toolCall',
                id: 'call-1',
                name: 'workspace.updateProject',
                arguments: { name: 'New' }
              }
            ],
            stopReason: 'toolUse'
          }
        ],
        toolConfirmationRequests: [
          {
            sessionId: 'session-1',
            callId: 'call-1',
            toolName: 'workspace.updateProject',
            summary: 'Rename the project to New.'
          }
        ]
      }
    })

    expect(projectAgentSessionMessages(state)[0]?.parts).toEqual([
      {
        type: 'tool-call',
        callId: 'call-1',
        toolName: 'workspace.updateProject',
        state: 'running',
        input: { name: 'New' }
      },
      {
        type: 'tool-confirmation',
        callId: 'call-1',
        toolName: 'workspace.updateProject',
        summary: 'Rename the project to New.',
        state: 'pending'
      }
    ])
  })
})
