import { cleanup, render, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSavedConversationStore } from "@spacezero/client-runtime";

const threadMock = vi.hoisted(() => ({
  stopCallbacks: [] as ((() => void) | undefined)[],
}));

vi.mock("@spacezero/ui/components/thread", () => ({
  Thread: ({ onStop }: { readonly onStop?: () => void }) => {
    threadMock.stopCallbacks.push(onStop);
    return (
      <button type="button" disabled={onStop === undefined} onClick={onStop}>
        Stop
      </button>
    );
  },
}));

const timestamp = "2026-01-01T00:00:00.000Z";

const latestStopCallback = (): (() => void) | undefined =>
  threadMock.stopCallbacks
    .filter((callback): callback is () => void => callback !== undefined)
    .at(-1);

describe("SavedConversationThread stop target binding", () => {
  afterEach(() => {
    cleanup();
    threadMock.stopCallbacks = [];
  });

  it("keeps a stale Stop callback from interrupting a newly active follow-up turn", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const interrupted: { sessionId: string; turnId: string }[] = [];
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({
        title: "margaux",
        lastSequence: 4,
        messages: [],
        activeTurn: {
          id: "turn-1",
          commandId: "command-1",
          state: "running" as const,
          userMessageId: "user-1",
          assistantMessageId: "assistant-1",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "partial answer",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
      subscribeEvents: (input) => {
        onEvent = (event) => input.onEvent(event as never);
        return { cancel: vi.fn(), closed: Promise.resolve() };
      },
      interruptTurn: async ({ sessionId, turnId }) => {
        interrupted.push({ sessionId, turnId });
      },
    });
    const { SavedConversationThread } =
      await import("./saved-conversation-thread.js");

    render(<SavedConversationThread store={store} />);

    await waitFor(() => expect(latestStopCallback()).toBeDefined());
    const staleStop = latestStopCallback();
    expect(staleStop).toBeDefined();

    act(() => {
      onEvent?.({
        sequence: 5,
        eventType: "AgentTurnInterruptedV1",
        event: {
          type: "AgentTurnInterruptedV1",
          version: 1,
          sessionId: "project-session-1",
          turnId: "turn-1",
          reason: "user_interrupted",
          timestamp: "2026-01-01T00:00:05.000Z",
        },
      });
      onEvent?.({
        sequence: 6,
        eventType: "AgentTurnStartedV1",
        event: {
          type: "AgentTurnStartedV1",
          version: 1,
          sessionId: "project-session-1",
          turnId: "turn-2",
          messageId: "assistant-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off",
          timestamp: "2026-01-01T00:00:06.000Z",
        },
      });
    });
    await waitFor(() => expect(latestStopCallback()).not.toBe(staleStop));
    expect(interrupted).toEqual([]);

    staleStop?.();
    await Promise.resolve();
    expect(interrupted).toEqual([]);

    latestStopCallback()?.();
    await waitFor(() =>
      expect(interrupted).toEqual([
        { sessionId: "project-session-1", turnId: "turn-2" },
      ]),
    );
  });
});
