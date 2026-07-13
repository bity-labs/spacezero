import { act, renderHook, waitFor } from '@testing-library/react'

import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'
import { useAgentSession } from './use-agent-session'

describe('useAgentSession', () => {
  it('subscribes to session projection events and exposes projected chat messages', async () => {
    let listener: ((event: AgentSessionProjectionEvent) => void) | undefined
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      listener = nextListener
      return () => {
        listener = undefined
      }
    }

    const { result, unmount } = renderHook(() => useAgentSession('session-1'))

    await waitFor(() => expect(result.current.sessionState?.sessionId).toBe('session-1'))

    act(() => {
      listener?.({
        type: 'snapshot',
        sessionId: 'session-1',
        seq: 1,
        snapshot: {
          status: 'idle',
          messages: [{ role: 'user', content: 'Hello', timestamp: 100 }]
        }
      })
    })

    expect(result.current.messages).toEqual([
      {
        id: 'agent-msg:0',
        role: 'user',
        createdAt: '1970-01-01T00:00:00.100Z',
        parts: [{ type: 'text', text: 'Hello' }]
      }
    ])

    unmount()
    expect(listener).toBeUndefined()
  })

  it('resets projection state when the session changes', async () => {
    let listener: ((event: AgentSessionProjectionEvent) => void) | undefined
    let subscriptionCount = 0
    const observedResults: Array<ReturnType<typeof useAgentSession>> = []
    window.spacezero.agent.onSessionProjectionEvent = (nextListener) => {
      subscriptionCount += 1
      listener = nextListener
      return () => {
        listener = undefined
      }
    }

    const { result, rerender } = renderHook(
      ({ sessionId }) => {
        const hookResult = useAgentSession(sessionId)
        observedResults.push(hookResult)
        return hookResult
      },
      {
        initialProps: { sessionId: 'session-1' }
      }
    )

    await waitFor(() => expect(result.current.sessionState?.sessionId).toBe('session-1'))

    act(() => {
      listener?.({
        type: 'snapshot',
        sessionId: 'session-1',
        seq: 1,
        snapshot: {
          status: 'idle',
          messages: [{ role: 'user', content: 'Old session message', timestamp: 100 }]
        }
      })
    })

    expect(result.current.messages).toHaveLength(1)

    observedResults.length = 0
    rerender({ sessionId: 'session-2' })

    expect(observedResults[0].state.sessionId).toBe('session-2')
    expect(observedResults[0].sessionState).toBeUndefined()
    expect(observedResults[0].messages).toEqual([])

    await waitFor(() => {
      expect(result.current.state.sessionId).toBe('session-2')
      expect(result.current.sessionState?.sessionId).toBe('session-2')
      expect(result.current.messages).toEqual([])
      expect(subscriptionCount).toBe(2)
    })

    act(() => {
      listener?.({
        type: 'snapshot',
        sessionId: 'session-2',
        seq: 1,
        snapshot: {
          status: 'running',
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'New session message' }],
              timestamp: 200
            }
          ]
        }
      })
    })

    expect(result.current.status).toBe('running')
    expect(result.current.messages).toEqual([
      {
        id: 'agent-msg:0',
        role: 'assistant',
        createdAt: '1970-01-01T00:00:00.200Z',
        status: 'streaming',
        parts: [{ type: 'text', text: 'New session message' }]
      }
    ])
  })

  it('routes tool confirmation answers through the preload API', async () => {
    const resolveToolConfirmation = vi.fn(async () => undefined)
    window.spacezero.agent.resolveToolConfirmation = resolveToolConfirmation

    const { result } = renderHook(() => useAgentSession('session-1'))
    await act(async () => {
      await result.current.resolveToolConfirmation('call-1', true)
    })

    expect(resolveToolConfirmation).toHaveBeenCalledWith({
      sessionId: 'session-1',
      callId: 'call-1',
      approved: true
    })
  })
})
