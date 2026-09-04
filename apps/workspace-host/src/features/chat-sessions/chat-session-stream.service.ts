export interface ChatSessionLiveEntry<LiveEnvelope> {
  readonly liveSequence: number;
  readonly envelope: LiveEnvelope;
}

export interface ChatSessionSseState<SseEnvelope> {
  readonly envelopes: readonly SseEnvelope[];
  readonly liveCursor: number;
}

export interface ChatSessionStreamService<DurableEnvelope, LiveEnvelope> {
  readonly publishLive: (sessionId: string, envelope: LiveEnvelope) => number;
  readonly liveCursor: (sessionId: string) => number;
  readonly wakeEvents: (sessionId: string) => void;
  readonly waitForSseAfter: (
    sessionId: string,
    after: number,
    afterLive: number,
    listEventsAfter: (
      sessionId: string,
      after: number,
    ) => Promise<readonly DurableEnvelope[]>,
    signal?: AbortSignal,
  ) => Promise<ChatSessionSseState<DurableEnvelope | LiveEnvelope>>;
}

export const createChatSessionStreamService = <DurableEnvelope, LiveEnvelope>(): ChatSessionStreamService<
  DurableEnvelope,
  LiveEnvelope
> => {
  const eventWaiters = new Map<string, Set<() => void>>();
  const liveEvents = new Map<
    string,
    ChatSessionLiveEntry<LiveEnvelope>[]
  >();
  let nextLiveSequence = 0;

  const wakeEvents = (sessionId: string): void => {
    const waiters = eventWaiters.get(sessionId);
    if (!waiters) return;
    eventWaiters.delete(sessionId);
    for (const resolve of waiters) resolve();
  };

  const waitForEvent = (
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<void> =>
    new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const waiters = eventWaiters.get(sessionId) ?? new Set<() => void>();
      const complete = (): void => {
        waiters.delete(complete);
        if (waiters.size === 0) eventWaiters.delete(sessionId);
        signal?.removeEventListener("abort", complete);
        resolve();
      };
      waiters.add(complete);
      eventWaiters.set(sessionId, waiters);
      signal?.addEventListener("abort", complete, { once: true });
    });

  const liveCursor = (sessionId: string): number =>
    liveEvents.get(sessionId)?.at(-1)?.liveSequence ?? nextLiveSequence;

  return {
    publishLive: (sessionId, envelope) => {
      const liveSequence = ++nextLiveSequence;
      const current = liveEvents.get(sessionId) ?? [];
      current.push({ liveSequence, envelope });
      if (current.length > 200) current.splice(0, current.length - 200);
      liveEvents.set(sessionId, current);
      wakeEvents(sessionId);
      return liveSequence;
    },
    liveCursor,
    wakeEvents,
    waitForSseAfter: async (
      sessionId,
      after,
      afterLive,
      listEventsAfter,
      signal,
    ) => {
      const waiting = waitForEvent(sessionId, signal);
      const events = await listEventsAfter(sessionId, after);
      const live = (liveEvents.get(sessionId) ?? []).filter(
        (event) => event.liveSequence > afterLive,
      );
      if (events.length > 0 || live.length > 0 || signal?.aborted)
        return {
          envelopes: [...events, ...live.map((event) => event.envelope)],
          liveCursor: live.at(-1)?.liveSequence ?? afterLive,
        };
      await waiting;
      const nextEvents = await listEventsAfter(sessionId, after);
      const nextLive = (liveEvents.get(sessionId) ?? []).filter(
        (event) => event.liveSequence > afterLive,
      );
      return {
        envelopes: [
          ...nextEvents,
          ...nextLive.map((event) => event.envelope),
        ],
        liveCursor: nextLive.at(-1)?.liveSequence ?? afterLive,
      };
    },
  };
};
