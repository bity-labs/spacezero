import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

import type { AgentSessionId, AgentStreamingEvent } from '../../../shared/agent-protocol'
import type { AiChatMessage } from '@renderer/components/ai-chat'
import { applyTranscriptEvent } from '@renderer/components/ai-chat/transcript-reducer'

type AgentSessionViewState = {
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  error: string | null
}

type AgentSessionViewAction =
  | { type: 'event'; event: AgentStreamingEvent }
  | { type: 'user-message'; message: AiChatMessage }
  | { type: 'error'; message: string }

function reducer(state: AgentSessionViewState, action: AgentSessionViewAction): AgentSessionViewState {
  switch (action.type) {
    case 'user-message':
      return { ...state, messages: [...state.messages, action.message], error: null }
    case 'error':
      return { ...state, status: 'idle', error: action.message }
    case 'event':
      return applyAgentEvent(state, action.event)
  }
}

function applyAgentEvent(state: AgentSessionViewState, event: AgentStreamingEvent): AgentSessionViewState {
  if (event.type === 'agent_start' || event.type === 'turn_start') {
    return { ...state, status: 'running', error: null }
  }

  if (event.type === 'agent_end' || event.type === 'turn_end') {
    return { ...state, status: 'idle' }
  }

  if (event.type === 'message_update' && event.delta) {
    const messageId = event.messageId ?? `${event.sessionId}-assistant-current`
    return {
      ...state,
      status: 'running',
      messages: applyTranscriptEvent(state.messages, {
        type: 'assistant-text-delta',
        messageId,
        delta: event.delta
      })
    }
  }

  if (event.type === 'message_end') {
    const messageId = event.messageId ?? `${event.sessionId}-assistant-current`
    return {
      ...state,
      messages: applyTranscriptEvent(state.messages, { type: 'assistant-complete', messageId })
    }
  }

  return state
}

export function useAgentSession(sessionId: AgentSessionId): {
  status: 'idle' | 'running'
  messages: AiChatMessage[]
  error: string | null
  prompt: (message: string) => Promise<void>
  abort: () => Promise<void>
} {
  const [state, dispatch] = useReducer(reducer, {
    status: 'idle',
    messages: [],
    error: null
  })
  const [pendingPromptId, setPendingPromptId] = useState(0)

  useEffect(() => {
    return window.spacezero.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return
      dispatch({ type: 'event', event })
    })
  }, [sessionId])

  const prompt = useCallback(
    async (message: string) => {
      const text = message.trim()
      if (!text) return

      const id = `${sessionId}-user-${Date.now()}-${pendingPromptId}`
      setPendingPromptId((current) => current + 1)
      dispatch({
        type: 'user-message',
        message: {
          id,
          role: 'user',
          status: 'complete',
          createdAt: new Date().toISOString(),
          parts: [{ type: 'text', text }]
        }
      })

      try {
        await window.spacezero.agent.prompt({ sessionId, message: text })
      } catch (error) {
        dispatch({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    },
    [pendingPromptId, sessionId]
  )

  const abort = useCallback(async () => {
    await window.spacezero.agent.abort({ sessionId })
  }, [sessionId])

  return useMemo(
    () => ({ status: state.status, messages: state.messages, error: state.error, prompt, abort }),
    [abort, prompt, state.error, state.messages, state.status]
  )
}
