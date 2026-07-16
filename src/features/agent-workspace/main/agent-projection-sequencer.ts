import type { AgentSessionProjectionEvent } from '../../../shared/agent-session-projection.model'

type AgentSessionProjectionEventWithoutSeq = AgentSessionProjectionEvent extends infer Event
  ? Event extends { seq: number }
    ? Omit<Event, 'seq'>
    : never
  : never

export type AgentSessionProjectionEventInput =
  | AgentSessionProjectionEvent
  | AgentSessionProjectionEventWithoutSeq

export function createAgentSessionProjectionSequencer(): {
  next: (event: AgentSessionProjectionEventInput) => AgentSessionProjectionEvent
  reset: () => void
} {
  const seqBySessionId = new Map<string, number>()

  return {
    next(event) {
      const seq = (seqBySessionId.get(event.sessionId) ?? 0) + 1
      seqBySessionId.set(event.sessionId, seq)

      const eventWithoutSeq = { ...event } as Partial<AgentSessionProjectionEvent>
      delete eventWithoutSeq.seq
      return { ...eventWithoutSeq, seq } as AgentSessionProjectionEvent
    },
    reset() {
      seqBySessionId.clear()
    }
  }
}
