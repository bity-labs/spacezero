import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'

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
  runtimeReadiness: 'loading' | 'ready' | 'error'
  restoreError: string | undefined
  retryRestore: () => void
  prompt: (message: string) => Promise<void>
  abort: () => Promise<void>
  resolveToolConfirmation: (callId: string, approved: boolean) => Promise<void>
}

type HookState = {
  projection: AgentSessionProjectionState
  sessionState: AgentSessionState | undefined
  runtimeReadiness: 'loading' | 'ready' | 'error'
  restoreError: string | undefined
}

type HookAction =
  | { type: 'session-changed'; sessionId: AgentSessionId }
  | { type: 'projection-event'; event: AgentSessionProjectionEvent }
  | { type: 'session-state-loading' }
  | { type: 'session-state-loaded'; sessionState: AgentSessionState }
  | { type: 'session-state-load-failed'; error: string }
  | { type: 'prompt-failed'; error: string }

export function useAgentSession(sessionId: AgentSessionId): UseAgentSessionResult {
  const [state, dispatch] = useReducer(hookReducer, sessionId, (id): HookState => ({
    projection: createAgentSessionProjectionState(id),
    sessionState: undefined,
    runtimeReadiness: 'loading',
    restoreError: undefined
  }))
  const [restoreAttempt, setRestoreAttempt] = useState(0)

  useEffect(() => {
    dispatch({ type: 'session-changed', sessionId })
  }, [sessionId])

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'session-state-loading' })

    void window.spacezero.agent
      .getState({ sessionId })
      .then((sessionState) => {
        if (!cancelled) dispatch({ type: 'session-state-loaded', sessionState })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'session-state-load-failed',
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [restoreAttempt, sessionId])

  useEffect(() => {
    return window.spacezero.agent.onSessionProjectionEvent((event) => {
      if (event.sessionId !== sessionId) return
      dispatch({ type: 'projection-event', event })
    })
  }, [sessionId])

  const prompt = useCallback(
    async (message: string) => {
      const text = message.trim()
      if (!text) return

      try {
        await window.spacezero.agent.prompt({ sessionId, message: text })
      } catch (error) {
        dispatch({
          type: 'prompt-failed',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    },
    [sessionId]
  )

  const abort = useCallback(async () => {
    await window.spacezero.agent.abort({ sessionId })
  }, [sessionId])

  const effectiveState = useMemo<HookState>(() => {
    if (state.projection.sessionId === sessionId) return state

    return {
      projection: createAgentSessionProjectionState(sessionId),
      sessionState: undefined,
      runtimeReadiness: 'loading',
      restoreError: undefined
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
    runtimeReadiness: effectiveState.runtimeReadiness,
    restoreError: effectiveState.restoreError,
    retryRestore: () => setRestoreAttempt((attempt) => attempt + 1),
    prompt,
    abort,
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
        sessionState: undefined,
        runtimeReadiness: 'loading',
        restoreError: undefined
      }
    case 'projection-event':
      return {
        ...state,
        projection: reduceAgentSessionProjectionState(state.projection, action.event)
      }
    case 'session-state-loading':
      return {
        ...state,
        runtimeReadiness: 'loading',
        restoreError: undefined,
        projection: {
          ...state.projection,
          lastError: undefined
        }
      }
    case 'session-state-loaded': {
      if (action.sessionState.sessionId !== state.projection.sessionId) return state
      const projection = action.sessionState.transcriptSnapshot
        ? reduceAgentSessionProjectionState(state.projection, {
            type: 'snapshot',
            sessionId: action.sessionState.sessionId,
            seq: state.projection.lastSeq + 1,
            snapshot: {
              status: action.sessionState.status,
              messages: action.sessionState.transcriptSnapshot
            }
          })
        : {
            ...state.projection,
            status: action.sessionState.status,
            lastError: undefined
          }

      return {
        ...state,
        sessionState: action.sessionState,
        runtimeReadiness: 'ready',
        restoreError: undefined,
        projection
      }
    }
    case 'session-state-load-failed':
      return {
        ...state,
        runtimeReadiness: 'error',
        restoreError: action.error,
        projection: {
          ...state.projection,
          lastError: action.error
        }
      }
    case 'prompt-failed':
      return {
        ...state,
        projection: {
          ...state.projection,
          lastError: action.error
        }
      }
  }
}
