import { useEffect, useMemo, useReducer } from 'react'

import type { AiChatMessage } from '@renderer/components/ai-chat'

import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'
import type { AgentSessionId, AgentSessionState } from '../../../shared/agent-protocol'
import {
  createAgentSessionProjectionState,
  projectAgentSessionMessages,
  reduceAgentSessionProjectionState,
  type AgentSessionProjectionState
} from './agent-session-projection'

export type UseAgentSessionResult = {
  state: AgentSessionProjectionState
  messages: AiChatMessage[]
  sessionState: AgentSessionState | undefined
  status: 'idle' | 'running'
  lastError: string | undefined
  resolveToolConfirmation: (callId: string, approved: boolean) => Promise<void>
}

type HookState = {
  projection: AgentSessionProjectionState
  sessionState: AgentSessionState | undefined
}

type HookAction =
  | { type: 'session-changed'; sessionId: AgentSessionId }
  | { type: 'projection-event'; event: AgentSessionProjectionEvent }
  | { type: 'session-state-loaded'; sessionState: AgentSessionState }
  | { type: 'load-failed'; error: string }

export function useAgentSession(sessionId: AgentSessionId): UseAgentSessionResult {
  const [state, dispatch] = useReducer(hookReducer, sessionId, (id) => ({
    projection: createAgentSessionProjectionState(id),
    sessionState: undefined
  }))

  useEffect(() => {
    dispatch({ type: 'session-changed', sessionId })
  }, [sessionId])

  useEffect(() => {
    let cancelled = false

    void window.spacezero.agent
      .getState({ sessionId })
      .then((sessionState) => {
        if (!cancelled) dispatch({ type: 'session-state-loaded', sessionState })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'load-failed',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    return window.spacezero.agent.onSessionProjectionEvent((event) => {
      if (event.sessionId !== sessionId) return
      dispatch({ type: 'projection-event', event })
    })
  }, [sessionId])

  const effectiveState = useMemo<HookState>(() => {
    if (state.projection.sessionId === sessionId) return state

    return {
      projection: createAgentSessionProjectionState(sessionId),
      sessionState: undefined
    }
  }, [state, sessionId])

  const messages = useMemo(
    () => projectAgentSessionMessages(effectiveState.projection),
    [effectiveState.projection]
  )

  return {
    state: effectiveState.projection,
    messages,
    sessionState: effectiveState.sessionState,
    status: effectiveState.projection.status,
    lastError: effectiveState.projection.lastError,
    resolveToolConfirmation: (callId, approved) =>
      window.spacezero.agent.resolveToolConfirmation({ sessionId, callId, approved })
  }
}

function hookReducer(state: HookState, action: HookAction): HookState {
  switch (action.type) {
    case 'session-changed':
      if (state.projection.sessionId === action.sessionId) return state
      return {
        projection: createAgentSessionProjectionState(action.sessionId),
        sessionState: undefined
      }
    case 'projection-event':
      return {
        ...state,
        projection: reduceAgentSessionProjectionState(state.projection, action.event)
      }
    case 'session-state-loaded':
      if (action.sessionState.sessionId !== state.projection.sessionId) return state
      return {
        ...state,
        sessionState: action.sessionState,
        projection: {
          ...state.projection,
          status: action.sessionState.status,
          lastError: undefined
        }
      }
    case 'load-failed':
      return {
        ...state,
        projection: {
          ...state.projection,
          lastError: action.error
        }
      }
  }
}
