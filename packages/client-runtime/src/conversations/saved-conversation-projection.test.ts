import { describe, expect, it, vi } from "vitest";
import {
  createGlobalChatDraftConversationStore,
  createGlobalChatSessionSavedConversationStore,
  createProjectSessionSavedConversationStore,
  createSavedConversationStore,
  globalChatDraftSessionId,
  type SavedConversationProjection,
} from "./saved-conversation-projection.js";
import type {
  GlobalChatSessionEventEnvelope,
  ProjectSessionEventEnvelope,
  ProjectSessionLiveEventEnvelope,
} from "@spacezero/host-contracts";
import type {
  GlobalChatSessionClient,
  ProjectSessionClient,
} from "../index.js";

const timestamp = "2026-01-01T00:00:00.000Z";
const projectSession = {
  id: "project-session-1",
  projectId: "project-1",
  name: "margaux",
  state: "ready" as const,
  sourceBranch: "main",
  sourceDetached: false,
  sourceCommit: "a".repeat(40),
  uncommittedChangesExcluded: false,
  managedBranch: "spacezero/margaux-11111111-1111-4111-8111-111111111111",
  createdAt: timestamp,
  updatedAt: timestamp,
  lastSequence: 4,
};
const globalSession = {
  id: "global-session-1",
  title: "Global prompt",
  archived: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  lastSequence: 4,
};
const messages = [
  {
    id: "message-2",
    role: "assistant" as const,
    text: "Second **assistant** message",
    sequence: 3,
    createdAt: "2026-01-01T00:00:02.000Z",
  },
  {
    id: "message-1",
    role: "user" as const,
    text: "First user message",
    sequence: 2,
    createdAt: "2026-01-01T00:00:01.000Z",
  },
];

const observeSnapshots = (store: {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SavedConversationProjection;
}) => {
  const snapshots: SavedConversationProjection[] = [store.getSnapshot()];
  const unsubscribe = store.subscribe(() =>
    snapshots.push(store.getSnapshot()),
  );
  return { snapshots, unsubscribe };
};

describe("saved conversation projection", () => {
  it("keeps the original prompt retryable when a newly created Global Chat turn fails", async () => {
    let deliverEvent:
      | ((event: GlobalChatSessionEventEnvelope) => void)
      | undefined;
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: globalChatDraftSessionId,
      load: async () => ({ title: "New chat", lastSequence: 0, messages: [] }),
      createWithFirstPrompt: vi.fn(async ({ prompt, commandId }) => ({
        session: {
          id: "global-session-1",
          title: "First prompt",
          archived: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastSequence: 2,
        },
        turn: {
          id: "turn-1",
          commandId,
          state: "running" as const,
          userMessageId: "user-message-1",
          assistantMessageId: "assistant-message-1",
          assistantMessageIds: ["assistant-message-1"],
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          draftMessages: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        userMessage: {
          id: "user-message-1",
          role: "user" as const,
          text: prompt,
          sequence: 2,
          createdAt: timestamp,
        },
      })),
      subscribeEvents: (input) => {
        deliverEvent = input.onEvent as (
          event: GlobalChatSessionEventEnvelope,
        ) => void;
        input.onOpen?.();
        return { cancel: vi.fn(), closed: Promise.resolve() };
      },
    });

    await store.load();
    await store.send("First prompt");
    deliverEvent?.({
      sequence: 3,
      eventType: "GlobalChatAgentTurnFailedV1",
      event: {
        type: "GlobalChatAgentTurnFailedV1",
        version: 1,
        sessionId: "global-session-1",
        turnId: "turn-1",
        reason: "provider_error",
        failureCategory: "provider",
        retryable: true,
        timestamp,
      },
    });

    expect(store.getSnapshot()).toMatchObject({
      runtime: { status: "failed", latestTurnId: "turn-1" },
      messages: [
        {
          id: "user-message-1",
          role: "user",
          text: "First prompt",
          turnId: "turn-1",
        },
      ],
    });
  });

  it("loads an archived Global Chat Session read-only with send blocked, and unarchive events re-enable sending", async () => {
    let deliverEvent: ((event: unknown) => void) | undefined;
    const client = {
      listMessages: vi.fn(async () => ({
        session: {
          ...globalSession,
          archived: true,
          archivedAt: timestamp,
        },
        messages,
      })),
      submitPrompt: vi.fn(async () => ({
        session: globalSession,
        turn: {
          id: "turn-2",
          commandId: "command-2",
          state: "completed" as const,
          userMessageId: "message-1",
          assistantMessageId: "message-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "done",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        userMessage: messages[1],
      })),
      subscribeEvents: vi.fn(
        (input: { onEvent: (event: unknown) => void }) => {
          deliverEvent = input.onEvent;
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
      ),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });
    const { snapshots, unsubscribe } = observeSnapshots(store);

    await store.load();

    expect(store.getSnapshot()).toMatchObject({
      archived: true,
      archivedAt: timestamp,
      actions: { send: "unavailable", stop: "unavailable" },
    });
    await expect(store.send("Blocked prompt")).rejects.toThrow(
      "send unavailable",
    );
    expect(deliverEvent).toBeDefined();

    // The Host archive/unarchive events drive live read-only transitions.
    deliverEvent?.({
      sequence: 9,
      eventType: "GlobalChatSessionUnarchivedV1",
      event: {
        type: "GlobalChatSessionUnarchivedV1",
        version: 1,
        sessionId: "global-session-1",
        commandId: "command-unarchive",
        timestamp: "2026-01-02T00:00:00.000Z",
      },
    });
    expect(store.getSnapshot()).toMatchObject({
      archived: false,
      actions: { send: "available" },
    });
    expect(snapshots.length).toBeGreaterThan(2);
    unsubscribe();
  });

  it("archives a Global Chat Session from durable events and blocks sends", async () => {
    let deliverEvent: ((event: unknown) => void) | undefined;
    const client = {
      listMessages: vi.fn(async () => ({
        session: { ...globalSession, archived: false },
        messages,
      })),
      submitPrompt: vi.fn(async () => ({
        session: globalSession,
        turn: {
          id: "turn-1",
          commandId: "command-1",
          state: "completed" as const,
          userMessageId: "message-1",
          assistantMessageId: "message-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "done",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        userMessage: messages[1],
      })),
      subscribeEvents: vi.fn(
        (input: { onEvent: (event: unknown) => void }) => {
          deliverEvent = input.onEvent;
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
      ),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });
    await store.load();
    expect(store.getSnapshot().actions).toMatchObject({ send: "available" });

    deliverEvent?.({
      sequence: 5,
      eventType: "GlobalChatSessionArchivedV1",
      event: {
        type: "GlobalChatSessionArchivedV1",
        version: 1,
        sessionId: "global-session-1",
        commandId: "command-archive",
        timestamp: "2026-01-01T12:00:00.000Z",
      },
    });

    expect(store.getSnapshot()).toMatchObject({
      archived: true,
      archivedAt: "2026-01-01T12:00:00.000Z",
      actions: { send: "unavailable", stop: "unavailable" },
    });
    await expect(store.send("Blocked prompt")).rejects.toThrow(
      "send unavailable",
    );
    expect(client.submitPrompt).not.toHaveBeenCalled();
  });

  it("updates the chat title from durable rename events, including while archived", async () => {
    let deliverEvent: ((event: unknown) => void) | undefined;
    const client = {
      listMessages: vi.fn(async () => ({
        session: { ...globalSession, archived: true, archivedAt: timestamp },
        messages,
      })),
      subscribeEvents: vi.fn(
        (input: { onEvent: (event: unknown) => void }) => {
          deliverEvent = input.onEvent;
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
      ),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      title: "Global prompt",
      archived: true,
      actions: { send: "unavailable" },
    });

    deliverEvent?.({
      sequence: 5,
      eventType: "GlobalChatSessionRenamedV1",
      event: {
        type: "GlobalChatSessionRenamedV1",
        version: 1,
        sessionId: "global-session-1",
        commandId: "command-rename",
        title: "Renamed while archived",
        timestamp: "2026-01-01T12:00:00.000Z",
      },
    });

    expect(store.getSnapshot()).toMatchObject({
      title: "Renamed while archived",
      archived: true,
      actions: { send: "unavailable" },
    });
  });
  it("loads Project Session saved messages through the Project Session client with Host-backed send available", async () => {
    const client = {
      listSessionMessages: vi.fn(async (sessionId: string) => {
        expect(sessionId).toBe("project-session-1");
        return {
          session: projectSession,
          messages,
          latestTurn: {
            id: "turn-1",
            commandId: "command-1",
            state: "completed" as const,
            userMessageId: "message-1",
            assistantMessageId: "message-2",
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "Second **assistant** message",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });
    const observed = observeSnapshots(store);

    await store.load();
    observed.unsubscribe();

    expect(client.listSessionMessages).toHaveBeenCalledTimes(1);
    expect(observed.snapshots.map((snapshot) => snapshot.status)).toEqual([
      "idle",
      "loading",
      "ready",
    ]);
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "project", id: "project-session-1" },
      status: "ready",
      title: "margaux",
      lastSequence: 4,
      actions: {
        send: "unavailable",
        edit: "unavailable",
        regenerate: "unavailable",
      },
      runtime: { status: "completed" },
    });
    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: "message-1",
        role: "user",
        text: "First user message",
        sequence: 2,
        createdAt: "2026-01-01T00:00:01.000Z",
        parts: [
          {
            id: "message-1:text:1",
            type: "text",
            order: 1,
            text: "First user message",
          },
        ],
      },
      {
        id: "message-2",
        role: "assistant",
        text: "Second **assistant** message",
        sequence: 3,
        createdAt: "2026-01-01T00:00:02.000Z",
        parts: [
          {
            id: "message-2:text:1",
            type: "text",
            order: 1,
            text: "Second **assistant** message",
          },
        ],
      },
    ]);
  });

  it("loads ordered reasoning and text parts without duplicating reasoning into assistant text", async () => {
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [
          {
            id: "assistant-message-1",
            role: "assistant" as const,
            text: "Final answer",
            sequence: 2,
            createdAt: "2026-01-01T00:00:02.000Z",
            turnId: "turn-1",
            parts: [
              {
                id: "assistant-message-1:reasoning:1",
                type: "reasoning" as const,
                order: 1,
                text: "Readable provider reasoning",
                turnId: "turn-1",
              },
              {
                id: "assistant-message-1:text:2",
                type: "text" as const,
                order: 2,
                text: "Final answer",
                turnId: "turn-1",
              },
            ],
          },
        ],
      })),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();

    expect(store.getSnapshot().messages[0]).toMatchObject({
      text: "Final answer",
      parts: [
        { type: "reasoning", order: 1, text: "Readable provider reasoning" },
        { type: "text", order: 2, text: "Final answer" },
      ],
    });
  });

  it("reconciles live reasoning deltas with settled durable parts", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    let onLiveEvent: ((event: unknown) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        onLiveEvent = input.onLiveEvent;
        input.onOpen?.();
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    onEvent?.({
      sequence: 5,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "high",
        timestamp,
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantReasoningDeltaV1",
      event: {
        type: "AssistantReasoningDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        order: 1,
        text: "Reason ",
        timestamp,
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        order: 2,
        text: "Answer",
        timestamp,
      },
    });

    expect(store.getSnapshot().messages[0]).toMatchObject({
      text: "Answer",
      parts: [
        { type: "reasoning", order: 1, text: "Reason " },
        { type: "text", order: 2, text: "Answer" },
      ],
    });

    onEvent?.({
      sequence: 6,
      eventType: "AgentMessageCompletedV1",
      event: {
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "Answer",
        parts: [
          {
            id: "assistant-message-1:reasoning:1",
            type: "reasoning",
            order: 1,
            text: "Reason completely.",
            turnId: "turn-1",
          },
          {
            id: "assistant-message-1:text:2",
            type: "text",
            order: 2,
            text: "Answer",
            turnId: "turn-1",
          },
        ],
        timestamp,
      },
    });

    expect(store.getSnapshot().messages[0]?.parts).toMatchObject([
      { type: "reasoning", text: "Reason completely." },
      { type: "text", text: "Answer" },
    ]);
  });

  it("turns durable storage-recovery failures into a blocked recovery runtime", async () => {
    let onEvent: ((event: ProjectSessionEventEnvelope) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        input.onOpen?.();
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    onEvent?.({
      sequence: 5,
      eventType: "AgentTurnFailedV1",
      event: {
        type: "AgentTurnFailedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        reason: "session_recovery_required",
        failureCategory: "system",
        retryable: false,
        timestamp,
      },
    });

    expect(store.getSnapshot()).toMatchObject({
      runtime: { status: "recovery_required", latestTurnId: "turn-1" },
      actions: { send: "unavailable", stop: "unavailable" },
    });
  });

  it("turns live persistence faults into recovery-required without waiting for a durable write", async () => {
    let onLiveEvent:
      ((event: ProjectSessionLiveEventEnvelope) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onLiveEvent = input.onLiveEvent;
        input.onOpen?.();
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    onLiveEvent?.({
      live: true,
      eventType: "ConversationPersistenceFailedV1",
      event: {
        type: "ConversationPersistenceFailedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        reason: "conversation_persistence_failed",
        timestamp,
      },
    });

    expect(store.getSnapshot()).toMatchObject({
      runtime: {
        status: "recovery_required",
        activeTurnId: "turn-1",
        latestTurnId: "turn-1",
      },
      actions: { send: "unavailable", stop: "unavailable" },
    });
  });

  it("loads recovery-required Global Chat turns with the composer blocked", async () => {
    const client = {
      listMessages: vi.fn(async () => ({
        session: globalSession,
        messages: [
          {
            id: "message-1",
            role: "user" as const,
            text: "First user message",
            sequence: 2,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "turn-1",
          commandId: "command-1",
          state: "recovery_required" as const,
          userMessageId: "message-1",
          assistantMessageId: "message-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          failureReason: "global_chat_session_recovery_required",
          failureCategory: "system" as const,
          retryable: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      })),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });

    await store.load();

    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "global-session-1" },
      runtime: { status: "recovery_required", activeTurnId: "turn-1" },
      actions: { send: "unavailable", stop: "unavailable" },
      messages: [{ role: "user", text: "First user message" }],
    });
  });

  it("loads older history incrementally while preserving live turn content without duplicate messages", async () => {
    let onLiveEvent:
      ((event: ProjectSessionLiveEventEnvelope) => void) | undefined;
    let resolveOlder!: (value: {
      lastSequence: number;
      messages: readonly {
        id: string;
        role: "user" | "assistant";
        text: string;
        sequence: number;
        createdAt: string;
      }[];
      hasMoreOlder: boolean;
    }) => void;
    const olderPage = new Promise<{
      lastSequence: number;
      messages: readonly {
        id: string;
        role: "user" | "assistant";
        text: string;
        sequence: number;
        createdAt: string;
      }[];
      hasMoreOlder: boolean;
    }>((resolve) => {
      resolveOlder = resolve;
    });
    const load = vi.fn(
      async (options?: { beforeSequence?: number; limit?: number }) => {
        if (options?.beforeSequence !== undefined) return olderPage;
        return {
          lastSequence: 101,
          messages: [
            {
              id: "recent-user",
              role: "user" as const,
              text: "recent prompt",
              sequence: 100,
              createdAt: timestamp,
            },
            {
              id: "active-assistant",
              role: "assistant" as const,
              text: "draft",
              sequence: 101,
              createdAt: timestamp,
              turnId: "turn-live",
              parts: [
                {
                  id: "active-assistant:text:1",
                  type: "text" as const,
                  order: 1,
                  text: "draft",
                  turnId: "turn-live",
                },
              ],
            },
          ],
          activeTurn: {
            id: "turn-live",
            commandId: "command-live",
            state: "running" as const,
            userMessageId: "recent-user",
            assistantMessageId: "active-assistant",
            assistantMessageIds: ["active-assistant"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "draft",
            draftMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          hasMoreOlder: true,
        };
      },
    );
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load,
      subscribeEvents: (input) => {
        onLiveEvent = input.onLiveEvent;
        return { cancel: () => undefined, closed: Promise.resolve() };
      },
    });

    await store.load();
    const loadingOlder = store.loadOlder();
    expect(store.getSnapshot().history).toEqual({
      hasMoreOlder: true,
      loadingOlder: true,
    });
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      "recent-user",
      "active-assistant",
    ]);

    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-live",
        messageId: "active-assistant",
        text: " continues",
        order: 1,
        timestamp,
      },
    });
    resolveOlder({
      lastSequence: 101,
      messages: [
        {
          id: "old-user",
          role: "user" as const,
          text: "old prompt",
          sequence: 1,
          createdAt: timestamp,
        },
        {
          id: "old-assistant",
          role: "assistant" as const,
          text: "old answer",
          sequence: 2,
          createdAt: timestamp,
        },
      ],
      hasMoreOlder: false,
    });
    await loadingOlder;

    expect(load).toHaveBeenLastCalledWith({ beforeSequence: 100, limit: 50 });
    expect(store.getSnapshot().history).toEqual({
      hasMoreOlder: false,
      loadingOlder: false,
    });
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      "old-user",
      "old-assistant",
      "recent-user",
      "active-assistant",
    ]);
    expect(store.getSnapshot().messages.at(-1)).toMatchObject({
      id: "active-assistant",
      text: "draft continues",
    });
  });

  it("does not advance the durable cursor past events excluded from an older history page", async () => {
    let onEvent: ((event: ProjectSessionEventEnvelope) => void) | undefined;
    const load = vi.fn(
      async (options?: { beforeSequence?: number; limit?: number }) => {
        if (options?.beforeSequence !== undefined) {
          return {
            lastSequence: 105,
            messages: [
              {
                id: "old-user",
                role: "user" as const,
                text: "old prompt",
                sequence: 1,
                createdAt: timestamp,
              },
            ],
            hasMoreOlder: false,
          };
        }
        return {
          lastSequence: 101,
          messages: [
            {
              id: "recent-user",
              role: "user" as const,
              text: "recent prompt",
              sequence: 100,
              createdAt: timestamp,
            },
            {
              id: "recent-assistant",
              role: "assistant" as const,
              text: "recent answer",
              sequence: 101,
              createdAt: timestamp,
            },
          ],
          hasMoreOlder: true,
        };
      },
    );
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load,
      subscribeEvents: (input) => {
        onEvent = input.onEvent;
        return { cancel: () => undefined, closed: Promise.resolve() };
      },
    });

    await store.load();
    expect(store.getSnapshot().lastSequence).toBe(101);

    await store.loadOlder();
    expect(load).toHaveBeenLastCalledWith({ beforeSequence: 100, limit: 50 });
    expect(store.getSnapshot().lastSequence).toBe(101);

    onEvent?.({
      sequence: 103,
      eventType: "UserMessageSubmittedV1",
      event: {
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId: "project-session-1",
        messageId: "durable-user-after-page",
        commandId: "command-after-older-page",
        prompt: "durable prompt after older page",
        timestamp,
      },
    });

    expect(store.getSnapshot().lastSequence).toBe(103);
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      "old-user",
      "recent-user",
      "recent-assistant",
      "durable-user-after-page",
    ]);
  });

  it("loads Global Chat saved messages through the Global Chat client into the same projection shape", async () => {
    const client = {
      listMessages: vi.fn(async (sessionId: string) => {
        expect(sessionId).toBe("global-session-1");
        return {
          session: globalSession,
          messages,
          activeTurn: {
            id: "turn-1",
            commandId: "command-1",
            state: "running" as const,
            userMessageId: "message-1",
            assistantMessageId: "message-2",
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "partial",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        };
      }),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });

    await store.load();

    expect(client.listMessages).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "global-session-1" },
      status: "ready",
      title: "Global prompt",
      lastSequence: 4,
      runtime: { status: "running" },
    });
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
    ]);
  });

  it("surfaces recovery-required active turns distinctly from running turns", async () => {
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages,
        activeTurn: {
          id: "11111111-1111-4111-8111-111111111111",
          commandId: "22222222-2222-4222-8222-222222222222",
          state: "recovery_required" as const,
          userMessageId: "33333333-3333-4333-8333-333333333333",
          assistantMessageId: "44444444-4444-4444-8444-444444444444",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "partial",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      })),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();

    expect(store.getSnapshot().runtime).toEqual({
      status: "recovery_required",
      activeTurnId: "11111111-1111-4111-8111-111111111111",
      latestTurnId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("sends a Project Session prompt with a pending user message and reconciles by command identity", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    let onLiveEvent: ((event: unknown) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      submitPrompt: vi.fn(
        async (_sessionId: string, prompt: string, commandId: string) => ({
          session: { ...projectSession, lastSequence: 2 },
          userMessage: {
            id: "host-user-message-1",
            role: "user" as const,
            text: prompt,
            sequence: 1,
            createdAt: "2026-01-01T00:00:01.000Z",
          },
          turn: {
            id: "turn-1",
            commandId,
            state: "running" as const,
            userMessageId: "host-user-message-1",
            assistantMessageId: "assistant-message-1",
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "",
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        }),
      ),
      subscribeProjectSessionEvents: vi.fn(
        (input: {
          onEvent: (event: unknown) => void;
          onLiveEvent?: (event: unknown) => void;
        }) => {
          onEvent = input.onEvent;
          onLiveEvent = input.onLiveEvent;
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
      ),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    const sent = store.send("  Build the prompt flow  ");
    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: expect.stringContaining("pending:"),
        text: "Build the prompt flow",
        status: "pending",
        commandId: expect.any(String),
      },
    ]);
    await sent;

    expect(client.submitPrompt).toHaveBeenCalledWith(
      "project-session-1",
      "Build the prompt flow",
      expect.any(String),
    );
    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: "host-user-message-1",
        role: "user",
        text: "Build the prompt flow",
        commandId: expect.any(String),
      },
    ]);
    expect(store.getSnapshot().messages[0]?.status).toBeUndefined();

    onEvent?.({
      sequence: 2,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "Hello ",
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "builder",
        timestamp: "2026-01-01T00:00:03.100Z",
      },
    });

    expect(store.getSnapshot().messages.at(-1)).toMatchObject({
      id: "assistant-message-1",
      role: "assistant",
      text: "Hello builder",
      turnId: "turn-1",
      parts: [
        {
          id: "assistant-message-1:text:1",
          type: "text",
          order: 1,
          text: "Hello builder",
          turnId: "turn-1",
        },
      ],
    });
  });

  it("keeps an ambiguous prompt submission unresolved under the original command identity across reload", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    let loadCount = 0;
    const client = {
      listSessionMessages: vi.fn(async () => {
        loadCount += 1;
        if (loadCount < 3)
          return {
            session: projectSession,
            messages: [],
          };
        return {
          session: { ...projectSession, lastSequence: 5 },
          messages: [
            {
              id: "reconciled-user-message",
              role: "user" as const,
              text: "may have committed",
              commandId: pendingCommandId,
              sequence: 5,
              createdAt: "2026-01-01T00:00:05.000Z",
            },
          ],
        };
      }),
      submitPrompt: vi.fn(async () => {
        throw new TypeError("fetch failed after request was sent");
      }),
      subscribeProjectSessionEvents: vi.fn(
        (input: { onEvent: (event: unknown) => void }) => {
          onEvent = input.onEvent;
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
      ),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });
    let pendingCommandId = "";

    await store.load();
    await expect(store.send("may have committed")).rejects.toThrow(
      "fetch failed after request was sent",
    );

    const pending = store.getSnapshot().messages[0]!;
    pendingCommandId = pending.commandId!;
    expect(pending).toMatchObject({
      id: expect.stringContaining("pending:"),
      role: "user",
      text: "may have committed",
      status: "pending",
      commandId: expect.any(String),
    });
    expect(store.getSnapshot().actions.send).toBe("unresolved");

    await store.load();

    expect(client.listSessionMessages).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: pending.id,
        role: "user",
        text: "may have committed",
        status: "pending",
        commandId: pending.commandId,
      },
    ]);
    expect(store.getSnapshot().actions.send).toBe("unresolved");

    await expect(store.send("do not duplicate")).rejects.toThrow(
      "send unavailable",
    );
    expect(client.submitPrompt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().messages[0]?.commandId).toBe(pending.commandId);

    await store.load();

    expect(store.getSnapshot().actions.send).toBe("available");
    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: "reconciled-user-message",
        role: "user",
        text: "may have committed",
        commandId: pending.commandId,
      },
    ]);
    expect(store.getSnapshot().messages[0]?.status).toBeUndefined();

    onEvent?.({
      sequence: 5,
      eventType: "UserMessageSubmittedV1",
      event: {
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId: "project-session-1",
        messageId: "reconciled-user-message",
        commandId: pending.commandId,
        prompt: "may have committed",
        timestamp: "2026-01-01T00:00:05.000Z",
      },
    });
    expect(store.getSnapshot().messages).toHaveLength(1);
  });

  it("does not reconcile ambiguous submissions by text when two prompts have identical content", async () => {
    let loadCount = 0;
    const client = {
      listSessionMessages: vi.fn(async () => {
        loadCount += 1;
        if (loadCount === 1) return { session: projectSession, messages: [] };
        return {
          session: { ...projectSession, lastSequence: 5 },
          messages: [
            {
              id: "different-user-message",
              role: "user" as const,
              text: "same text",
              commandId: "11111111-1111-4111-8111-111111111111",
              sequence: 5,
              createdAt: "2026-01-01T00:00:05.000Z",
            },
          ],
        };
      }),
      submitPrompt: vi.fn(async () => {
        throw new TypeError("fetch failed after request was sent");
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    await expect(store.send("same text")).rejects.toThrow("fetch failed");
    const pendingCommandId = store.getSnapshot().messages[0]!.commandId!;

    await store.load();

    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: "different-user-message",
        text: "same text",
        commandId: "11111111-1111-4111-8111-111111111111",
      },
      {
        id: expect.stringContaining("pending:"),
        text: "same text",
        commandId: pendingCommandId,
        status: "pending",
      },
    ]);
    expect(store.getSnapshot().actions.send).toBe("unresolved");
    expect(client.submitPrompt).toHaveBeenCalledTimes(1);
  });

  it("enqueues a Project Session follow-up through the Host while a turn is running", async () => {
    const enqueueFollowUp = vi.fn(
      async (_sessionId: string, prompt: string, commandId: string) => ({
        session: { ...projectSession, lastSequence: 5 },
        followUp: {
          id: "follow-up-1",
          commandId,
          sessionId: "project-session-1",
          prompt,
          state: "queued" as const,
          position: 1,
          createdAt: "2026-01-01T00:00:05.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
        },
      }),
    );
    const submitPrompt = vi.fn();
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [
          {
            id: "user-message-1",
            role: "user" as const,
            text: "first",
            commandId: "command-running",
            sequence: 1,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "turn-running",
          commandId: "command-running",
          state: "running" as const,
          userMessageId: "user-message-1",
          assistantMessageId: "assistant-message-1",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "working",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      })),
      listFollowUps: vi.fn(async () => ({
        session: projectSession,
        followUps: [],
      })),
      submitPrompt,
      enqueueFollowUp,
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    expect(store.getSnapshot().actions.send).toBe("available");
    const sent = store.send("  do this next  ");

    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: expect.stringContaining("pending:"),
        prompt: "do this next",
        state: "queued",
        status: "pending",
      },
    ]);
    await sent;

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(enqueueFollowUp).toHaveBeenCalledWith(
      "project-session-1",
      "do this next",
      expect.any(String),
    );
    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "follow-up-1",
        prompt: "do this next",
        state: "queued",
      },
    ]);
    expect(store.getSnapshot().queue.followUps[0]?.status).toBeUndefined();
  });

  it("enqueues a Global Chat follow-up through the same store behavior while a turn is running", async () => {
    const enqueueFollowUp = vi.fn(
      async (_sessionId: string, prompt: string, commandId: string) => ({
        session: { ...globalSession, lastSequence: 5 },
        followUp: {
          id: "global-follow-up-1",
          commandId,
          sessionId: "global-session-1",
          prompt,
          state: "queued" as const,
          position: 1,
          createdAt: "2026-01-01T00:00:05.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
        },
      }),
    );
    const submitPrompt = vi.fn();
    const client = {
      listMessages: vi.fn(async () => ({
        session: globalSession,
        messages: [
          {
            id: "global-user-message-1",
            role: "user" as const,
            text: "first",
            commandId: "command-running",
            sequence: 1,
            createdAt: timestamp,
          },
        ],
        activeTurn: {
          id: "global-turn-running",
          commandId: "command-running",
          state: "running" as const,
          userMessageId: "global-user-message-1",
          assistantMessageId: "global-assistant-message-1",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "working",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      })),
      listFollowUps: vi.fn(async () => ({
        session: globalSession,
        followUps: [],
      })),
      submitPrompt,
      enqueueFollowUp,
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });

    await store.load();
    await store.send("  global follow-up  ");

    expect(submitPrompt).not.toHaveBeenCalled();
    expect(enqueueFollowUp).toHaveBeenCalledWith(
      "global-session-1",
      "global follow-up",
      expect.any(String),
    );
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "global-session-1" },
      queue: {
        followUps: [
          {
            id: "global-follow-up-1",
            prompt: "global follow-up",
            state: "queued",
          },
        ],
      },
    });
  });

  it("restores Global Chat follow-up state transitions from query and events", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const client = {
      listMessages: vi.fn(async () => ({
        session: globalSession,
        messages: [],
      })),
      listFollowUps: vi.fn(async () => ({
        session: globalSession,
        followUps: [
          {
            id: "global-follow-up-1",
            commandId: "global-command-1",
            sessionId: "global-session-1",
            prompt: "first",
            state: "queued" as const,
            position: 1,
            createdAt: "2026-01-01T00:00:05.000Z",
            updatedAt: "2026-01-01T00:00:05.000Z",
          },
        ],
      })),
      subscribeEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "global-session-1",
    });

    await store.load();
    onEvent?.({
      sequence: 5,
      eventType: "GlobalChatSessionFollowUpDispatchedV1",
      event: {
        type: "GlobalChatSessionFollowUpDispatchedV1",
        version: 1,
        sessionId: "global-session-1",
        followUpId: "global-follow-up-1",
        commandId: "global-command-1",
        timestamp: "2026-01-01T00:00:07.000Z",
      },
    });
    onEvent?.({
      sequence: 6,
      eventType: "GlobalChatSessionFollowUpConsumedV1",
      event: {
        type: "GlobalChatSessionFollowUpConsumedV1",
        version: 1,
        sessionId: "global-session-1",
        followUpId: "global-follow-up-1",
        commandId: "global-command-1",
        turnId: "global-turn-from-follow-up",
        timestamp: "2026-01-01T00:00:08.000Z",
      },
    });

    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "global-follow-up-1",
        state: "consumed",
        dispatchedTurnId: "global-turn-from-follow-up",
      },
    ]);
  });

  it("restores Host follow-up ordering and state transitions from query and events", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      listFollowUps: vi.fn(async () => ({
        session: projectSession,
        followUps: [
          {
            id: "follow-up-2",
            commandId: "command-2",
            sessionId: "project-session-1",
            prompt: "second",
            state: "queued" as const,
            position: 2,
            createdAt: "2026-01-01T00:00:06.000Z",
            updatedAt: "2026-01-01T00:00:06.000Z",
          },
          {
            id: "follow-up-1",
            commandId: "command-1",
            sessionId: "project-session-1",
            prompt: "first",
            state: "queued" as const,
            position: 1,
            createdAt: "2026-01-01T00:00:05.000Z",
            updatedAt: "2026-01-01T00:00:05.000Z",
          },
        ],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();

    expect(store.getSnapshot().queue.followUps.map((item) => item.id)).toEqual([
      "follow-up-1",
      "follow-up-2",
    ]);

    onEvent?.({
      sequence: 5,
      eventType: "ProjectSessionFollowUpDispatchedV1",
      event: {
        type: "ProjectSessionFollowUpDispatchedV1",
        version: 1,
        sessionId: "project-session-1",
        followUpId: "follow-up-1",
        commandId: "command-1",
        timestamp: "2026-01-01T00:00:07.000Z",
      },
    });
    onEvent?.({
      sequence: 6,
      eventType: "ProjectSessionFollowUpConsumedV1",
      event: {
        type: "ProjectSessionFollowUpConsumedV1",
        version: 1,
        sessionId: "project-session-1",
        followUpId: "follow-up-1",
        commandId: "command-1",
        turnId: "turn-from-follow-up",
        timestamp: "2026-01-01T00:00:08.000Z",
      },
    });
    onEvent?.({
      sequence: 7,
      eventType: "ProjectSessionFollowUpCancelledV1",
      event: {
        type: "ProjectSessionFollowUpCancelledV1",
        version: 1,
        sessionId: "project-session-1",
        followUpId: "follow-up-2",
        commandId: "command-2",
        timestamp: "2026-01-01T00:00:09.000Z",
      },
    });

    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "follow-up-1",
        state: "consumed",
        dispatchedTurnId: "turn-from-follow-up",
      },
      { id: "follow-up-2", state: "cancelled" },
    ]);
  });

  it("resumes Project Session events from the lowest split snapshot sequence", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: { ...projectSession, lastSequence: 4 },
        messages: [],
      })),
      listFollowUps: vi.fn(async () => ({
        session: { ...projectSession, lastSequence: 6 },
        followUps: [
          {
            id: "follow-up-1",
            commandId: "command-1",
            sessionId: "project-session-1",
            prompt: "continue after current turn",
            state: "consumed" as const,
            position: 1,
            createdAt: "2026-01-01T00:00:05.000Z",
            updatedAt: "2026-01-01T00:00:07.000Z",
            dispatchedTurnId: "turn-from-follow-up",
          },
        ],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();

    expect(client.subscribeProjectSessionEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "project-session-1",
        after: 4,
      }),
    );

    onEvent?.({
      sequence: 5,
      eventType: "UserMessageSubmittedV1",
      event: {
        type: "UserMessageSubmittedV1",
        version: 1,
        sessionId: "project-session-1",
        messageId: "message-from-split-window",
        commandId: "command-from-split-window",
        prompt: "message committed between split queries",
        timestamp: "2026-01-01T00:00:06.000Z",
      },
    });

    expect(store.getSnapshot().messages).toMatchObject([
      {
        id: "message-from-split-window",
        text: "message committed between split queries",
      },
    ]);
    expect(store.getSnapshot().lastSequence).toBe(5);
    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "follow-up-1",
        state: "consumed",
        dispatchedTurnId: "turn-from-follow-up",
      },
    ]);
  });

  it("keeps an ambiguous follow-up enqueue unresolved by command identity across reload", async () => {
    let loadCount = 0;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
        activeTurn: {
          id: "turn-running",
          commandId: "command-running",
          state: "running" as const,
          userMessageId: "user-message-1",
          assistantMessageId: "assistant-message-1",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "working",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      })),
      listFollowUps: vi.fn(async () => {
        loadCount += 1;
        if (loadCount === 1) return { session: projectSession, followUps: [] };
        return {
          session: projectSession,
          followUps: [
            {
              id: "other-follow-up",
              commandId: "other-command",
              sessionId: "project-session-1",
              prompt: "same text",
              state: "queued" as const,
              position: 1,
              createdAt: "2026-01-01T00:00:06.000Z",
              updatedAt: "2026-01-01T00:00:06.000Z",
            },
          ],
        };
      }),
      enqueueFollowUp: vi.fn(async () => {
        throw new TypeError("fetch failed after enqueue may have committed");
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    await expect(store.send("same text")).rejects.toThrow("fetch failed");
    const pendingCommandId = store.getSnapshot().queue.followUps[0]!.commandId;

    await store.load();

    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "other-follow-up",
        commandId: "other-command",
        prompt: "same text",
      },
      {
        id: expect.stringContaining("pending:"),
        commandId: pendingCommandId,
        prompt: "same text",
        status: "pending",
      },
    ]);
    expect(store.getSnapshot().actions.send).toBe("unresolved");
    await expect(store.send("do not duplicate")).rejects.toThrow(
      "send unavailable",
    );
  });

  it.each([
    {
      kind: "project" as const,
      sessionId: "project-session-1",
      interruptedEventType: "AgentTurnInterruptedV1" as const,
      startedEventType: "AgentTurnStartedV1" as const,
    },
    {
      kind: "global" as const,
      sessionId: "global-session-1",
      interruptedEventType: "GlobalChatAgentTurnInterruptedV1" as const,
      startedEventType: "GlobalChatAgentTurnStartedV1" as const,
    },
  ])(
    "keeps Stop targeted to the captured $kind turn while a follow-up starts",
    async ({ kind, sessionId, interruptedEventType, startedEventType }) => {
      let onEvent: ((event: unknown) => void) | undefined;
      let releaseInterrupt!: () => void;
      const interruptReleased = new Promise<void>((resolve) => {
        releaseInterrupt = resolve;
      });
      const interruptTurn = vi.fn(async () => {
        await interruptReleased;
      });
      const store = createSavedConversationStore({
        kind,
        sessionId,
        load: async () => ({
          title: kind === "project" ? "margaux" : "Global prompt",
          lastSequence: 4,
          messages: [],
          activeTurn: {
            id: "turn-1",
            commandId: "command-1",
            state: "running" as const,
            userMessageId: "user-1",
            assistantMessageId: "assistant-1",
            assistantMessageIds: ["assistant-1"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "partial answer",
            draftMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        }),
        subscribeEvents: (input) => {
          onEvent = (event) => input.onEvent(event as never);
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
        interruptTurn,
      });
      await store.load();

      const stopping = store.stop({ sessionId, turnId: "turn-1" });
      expect(interruptTurn).toHaveBeenCalledWith({
        sessionId,
        turnId: "turn-1",
      });
      expect(store.getSnapshot().actions.stop).toBe("unavailable");

      onEvent?.({
        sequence: 5,
        eventType: interruptedEventType,
        event: {
          type: interruptedEventType,
          version: 1,
          sessionId,
          turnId: "turn-1",
          reason: "user_interrupted",
          timestamp: "2026-01-01T00:00:05.000Z",
        },
      });
      onEvent?.({
        sequence: 6,
        eventType: startedEventType,
        event: {
          type: startedEventType,
          version: 1,
          sessionId,
          turnId: "turn-2",
          messageId: "assistant-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off",
          timestamp: "2026-01-01T00:00:06.000Z",
        },
      });

      expect(store.getSnapshot().runtime).toMatchObject({
        status: "running",
        activeTurnId: "turn-2",
      });
      expect(store.getSnapshot().actions.stop).toBe("unavailable");
      await expect(store.stop({ sessionId, turnId: "turn-2" })).rejects.toThrow(
        "stop unavailable",
      );
      expect(interruptTurn).toHaveBeenCalledTimes(1);

      releaseInterrupt();
      await stopping;
      expect(store.getSnapshot().actions.stop).toBe("available");
    },
  );

  it.each([
    {
      kind: "project" as const,
      sessionId: "project-session-1",
      interruptedEventType: "AgentTurnInterruptedV1" as const,
      startedEventType: "AgentTurnStartedV1" as const,
    },
    {
      kind: "global" as const,
      sessionId: "global-session-1",
      interruptedEventType: "GlobalChatAgentTurnInterruptedV1" as const,
      startedEventType: "GlobalChatAgentTurnStartedV1" as const,
    },
  ])(
    "ignores a stale $kind stop target after a follow-up turn becomes active",
    async ({ kind, sessionId, interruptedEventType, startedEventType }) => {
      let onEvent: ((event: unknown) => void) | undefined;
      const interruptTurn = vi.fn(async () => undefined);
      const store = createSavedConversationStore({
        kind,
        sessionId,
        load: async () => ({
          title: kind === "project" ? "margaux" : "Global prompt",
          lastSequence: 4,
          messages: [],
          activeTurn: {
            id: "turn-1",
            commandId: "command-1",
            state: "running" as const,
            userMessageId: "user-1",
            assistantMessageId: "assistant-1",
            assistantMessageIds: ["assistant-1"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "partial answer",
            draftMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        }),
        subscribeEvents: (input) => {
          onEvent = (event) => input.onEvent(event as never);
          return { cancel: vi.fn(), closed: Promise.resolve() };
        },
        interruptTurn,
      });
      await store.load();

      const staleStop = () => store.stop({ sessionId, turnId: "turn-1" });

      onEvent?.({
        sequence: 5,
        eventType: interruptedEventType,
        event: {
          type: interruptedEventType,
          version: 1,
          sessionId,
          turnId: "turn-1",
          reason: "user_interrupted",
          timestamp: "2026-01-01T00:00:05.000Z",
        },
      });
      onEvent?.({
        sequence: 6,
        eventType: startedEventType,
        event: {
          type: startedEventType,
          version: 1,
          sessionId,
          turnId: "turn-2",
          messageId: "assistant-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off",
          timestamp: "2026-01-01T00:00:06.000Z",
        },
      });

      expect(store.getSnapshot().runtime).toMatchObject({
        status: "running",
        activeTurnId: "turn-2",
      });
      expect(store.getSnapshot().actions.stop).toBe("available");
      await staleStop();
      expect(interruptTurn).not.toHaveBeenCalled();

      await store.stop({ sessionId, turnId: "turn-2" });
      expect(interruptTurn).toHaveBeenCalledWith({
        sessionId,
        turnId: "turn-2",
      });
    },
  );

  it("refreshes authoritative queue state when a queued follow-up cancellation races dispatch", async () => {
    const cancelFollowUp = vi.fn(async () => {
      const error = new Error("follow-up already dispatched") as Error & {
        response?: { status: number };
      };
      error.response = { status: 409 };
      throw error;
    });
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      listFollowUps: vi.fn(async () => ({
        session: projectSession,
        followUps: [
          {
            id: "follow-up-1",
            commandId: "command-1",
            sessionId: "project-session-1",
            prompt: "race dispatch",
            state: "dispatched" as const,
            position: 1,
            dispatchedTurnId: "turn-1",
            createdAt: "2026-01-01T00:00:05.000Z",
            updatedAt: "2026-01-01T00:00:08.000Z",
          },
        ],
      })),
      cancelFollowUp,
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });
    await store.load();

    await expect(store.cancelFollowUp("follow-up-1")).rejects.toThrow(
      "follow-up already dispatched",
    );

    expect(cancelFollowUp).toHaveBeenCalledWith(
      "project-session-1",
      "follow-up-1",
    );
    expect(store.getSnapshot().queue.followUps).toMatchObject([
      {
        id: "follow-up-1",
        state: "dispatched",
        dispatchedTurnId: "turn-1",
      },
    ]);
  });

  it("ignores duplicate durable events and late live deltas after completion", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    let onLiveEvent: ((event: unknown) => void) | undefined;
    const store = createSavedConversationStore({
      kind: "project",
      sessionId: "project-session-1",
      load: async () => ({
        title: "margaux",
        lastSequence: 1,
        messages: [
          {
            id: "user-message-1",
            role: "user" as const,
            text: "hello",
            sequence: 1,
            createdAt: timestamp,
          },
        ],
      }),
      subscribeEvents: (input) => {
        onEvent = (event: unknown) => input.onEvent(event as never);
        onLiveEvent = (event: unknown) => input.onLiveEvent?.(event as never);
        return { cancel: vi.fn(), closed: Promise.resolve() };
      },
    });

    await store.load();
    onEvent?.({
      sequence: 2,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp: "2026-01-01T00:00:02.000Z",
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "partial",
        timestamp: "2026-01-01T00:00:03.000Z",
      },
    });
    onEvent?.({
      sequence: 3,
      eventType: "AgentMessageCheckpointedV1",
      event: {
        type: "AgentMessageCheckpointedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "partial checkpoint",
        timestamp: "2026-01-01T00:00:03.500Z",
      },
    });
    onEvent?.({
      sequence: 4,
      eventType: "AgentMessageCompletedV1",
      event: {
        type: "AgentMessageCompletedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "final answer",
        timestamp: "2026-01-01T00:00:04.000Z",
      },
    });
    onEvent?.({
      sequence: 3,
      eventType: "AgentMessageCheckpointedV1",
      event: {
        type: "AgentMessageCheckpointedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: "stale checkpoint",
        timestamp: "2026-01-01T00:00:03.500Z",
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-message-1",
        text: " stale live",
        timestamp: "2026-01-01T00:00:04.500Z",
      },
    });

    expect(store.getSnapshot().lastSequence).toBe(4);
    expect(store.getSnapshot().runtime.status).toBe("completed");
    expect(store.getSnapshot().messages.at(-1)).toMatchObject({
      id: "assistant-message-1",
      text: "final answer",
    });
  });

  it("reloads authoritative running state when an event subscription reconnects after missed live deltas", async () => {
    let onOpen: (() => void) | undefined;
    let onError: ((error: Error) => void) | undefined;
    let loadCount = 0;
    const store = createSavedConversationStore({
      kind: "global",
      sessionId: "global-session-1",
      load: async () => {
        loadCount += 1;
        if (loadCount === 1)
          return {
            title: "Global prompt",
            lastSequence: 4,
            messages: [
              {
                id: "global-user-message-1",
                role: "user" as const,
                text: "hello",
                sequence: 3,
                createdAt: timestamp,
              },
            ],
            activeTurn: {
              id: "global-turn-1",
              commandId: "11111111-1111-4111-8111-111111111111",
              state: "running" as const,
              userMessageId: "global-user-message-1",
              assistantMessageId: "global-assistant-message-1",
              assistantMessageIds: ["global-assistant-message-1"],
              providerId: "anthropic",
              modelId: "claude-sonnet-4-5",
              thinkingLevel: "off" as const,
              draftText: "",
              draftMessages: [],
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          };
        return {
          title: "Global prompt",
          lastSequence: 5,
          messages: [
            {
              id: "global-user-message-1",
              role: "user" as const,
              text: "hello",
              sequence: 3,
              createdAt: timestamp,
            },
          ],
          activeTurn: {
            id: "global-turn-1",
            commandId: "11111111-1111-4111-8111-111111111111",
            state: "running" as const,
            userMessageId: "global-user-message-1",
            assistantMessageId: "global-assistant-message-1",
            assistantMessageIds: ["global-assistant-message-1"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "authoritative draft",
            draftMessages: [
              {
                id: "global-assistant-message-1",
                text: "authoritative draft",
                parts: [
                  {
                    id: "global-assistant-message-1:text:1",
                    type: "text" as const,
                    order: 1,
                    text: "authoritative draft",
                    turnId: "global-turn-1",
                  },
                ],
              },
            ],
            createdAt: timestamp,
            updatedAt: "2026-01-01T00:00:06.000Z",
          },
        };
      },
      subscribeEvents: (input) => {
        onOpen = input.onOpen;
        onError = input.onError;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      },
    });

    await store.load();
    expect(store.getSnapshot().connection.status).toBe("connected");

    onError?.(new Error("stream disconnected"));
    expect(store.getSnapshot().connection).toMatchObject({
      status: "disconnected",
      message: "stream disconnected",
    });
    expect(store.getSnapshot().runtime.status).toBe("running");

    onOpen?.();
    await vi.waitFor(() =>
      expect(store.getSnapshot().messages.at(-1)).toMatchObject({
        id: "global-assistant-message-1",
        text: "authoritative draft",
      }),
    );
    expect(store.getSnapshot().connection.status).toBe("connected");
    expect(store.getSnapshot().lastSequence).toBe(5);
  });

  it.each(["project", "global"] as const)(
    "appends ordered active draft messages with distinct IDs for %s reloads",
    async (kind) => {
      const store = createSavedConversationStore({
        kind,
        sessionId: `${kind}-session-1`,
        load: async () => ({
          title: kind === "project" ? "margaux" : "Global prompt",
          lastSequence: 5,
          messages: [
            {
              id: `${kind}-user-message-1`,
              role: "user" as const,
              text: "hello",
              sequence: 3,
              createdAt: timestamp,
            },
          ],
          activeTurn: {
            id: `${kind}-turn-1`,
            commandId: "11111111-1111-4111-8111-111111111111",
            state: "running" as const,
            userMessageId: `${kind}-user-message-1`,
            assistantMessageId: `${kind}-assistant-message-1`,
            assistantMessageIds: [
              `${kind}-assistant-message-1`,
              `${kind}-assistant-message-2`,
            ],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "first draftsecond draft",
            draftMessages: [
              {
                id: `${kind}-assistant-message-1`,
                text: "first draft",
                parts: [
                  {
                    id: `${kind}-assistant-message-1:text:1`,
                    type: "text" as const,
                    order: 1,
                    text: "first draft",
                    turnId: `${kind}-turn-1`,
                  },
                ],
              },
              {
                id: `${kind}-assistant-message-2`,
                text: "second draft",
                parts: [
                  {
                    id: `${kind}-assistant-message-2:text:1`,
                    type: "text" as const,
                    order: 1,
                    text: "second draft",
                    turnId: `${kind}-turn-1`,
                  },
                ],
              },
            ],
            createdAt: timestamp,
            updatedAt: "2026-01-01T00:00:05.000Z",
          },
        }),
        subscribeEvents: () => ({
          cancel: vi.fn(),
          closed: Promise.resolve(),
        }),
      });

      await store.load();

      const assistantMessages = store
        .getSnapshot()
        .messages.filter((message) => message.role === "assistant");
      expect(assistantMessages.map((message) => message.id)).toEqual([
        `${kind}-assistant-message-1`,
        `${kind}-assistant-message-2`,
      ]);
      expect(assistantMessages.map((message) => message.text)).toEqual([
        "first draft",
        "second draft",
      ]);
    },
  );

  it("surfaces typed Host errors from a failed first draft send", async () => {
    const client = {
      createWithFirstPrompt: vi.fn(async () => {
        throw {
          code: "command_id_conflict",
          message:
            "This Global Chat Session command ID was already used for different input.",
        };
      }),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatDraftConversationStore({ client });

    await store.load();
    await expect(store.send("First global prompt")).rejects.toMatchObject({
      code: "command_id_conflict",
    });

    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: globalChatDraftSessionId },
      error: {
        message:
          "This Global Chat Session command ID was already used for different input.",
      },
    });
  });

  it("does not subscribe to Host events while the draft has no durable session", async () => {
    const subscribeEvents = vi.fn(() => ({
      cancel: vi.fn(),
      closed: Promise.resolve(),
    }));
    const client = {
      createWithFirstPrompt: vi.fn(
        async (prompt: string, commandId: string) => ({
          session: {
            ...globalSession,
            id: "created-global-session",
            lastSequence: 4,
          },
          userMessage: {
            id: "created-user-message",
            role: "user" as const,
            text: prompt,
            sequence: 3,
            createdAt: "2026-01-01T00:00:03.000Z",
          },
          firstMessage: {
            id: "created-user-message",
            role: "user" as const,
            text: prompt,
            sequence: 3,
            createdAt: "2026-01-01T00:00:03.000Z",
          },
          turn: {
            id: "global-turn-1",
            commandId,
            state: "running" as const,
            userMessageId: "created-user-message",
            assistantMessageId: "created-assistant-message",
            assistantMessageIds: ["created-assistant-message"],
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "",
            draftMessages: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        }),
      ),
      subscribeEvents,
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatDraftConversationStore({ client });

    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: globalChatDraftSessionId },
      status: "empty",
      messages: [],
    });
    expect(subscribeEvents).not.toHaveBeenCalled();

    await store.send("First global prompt");

    expect(subscribeEvents).toHaveBeenCalledTimes(1);
    expect(subscribeEvents).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "created-global-session" }),
    );
  });

  it("creates a Global Chat Session only on first draft send without duplicating the prompt", async () => {
    const createWithFirstPrompt = vi.fn(
      async (prompt: string, commandId: string) => ({
        session: {
          ...globalSession,
          id: "created-global-session",
          lastSequence: 4,
        },
        userMessage: {
          id: "created-user-message",
          role: "user" as const,
          text: prompt,
          sequence: 3,
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        firstMessage: {
          id: "created-user-message",
          role: "user" as const,
          text: prompt,
          sequence: 3,
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        turn: {
          id: "global-turn-1",
          commandId,
          state: "running" as const,
          userMessageId: "created-user-message",
          assistantMessageId: "created-assistant-message",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    const client = {
      createWithFirstPrompt,
      subscribeEvents: vi.fn(() => ({
        cancel: vi.fn(),
        closed: Promise.resolve(),
      })),
      interruptTurn: vi.fn(),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatDraftConversationStore({ client });

    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "draft" },
      status: "empty",
      messages: [],
    });
    await store.send("First global prompt");

    expect(createWithFirstPrompt).toHaveBeenCalledWith(
      "First global prompt",
      expect.any(String),
    );
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "created-global-session" },
      title: "Global prompt",
      messages: [
        {
          id: "created-user-message",
          role: "user",
          text: "First global prompt",
        },
      ],
    });
    expect(
      store
        .getSnapshot()
        .messages.filter((message) => message.text === "First global prompt"),
    ).toHaveLength(1);
  });

  it("sends subsequent Global Chat draft prompts to the created Session", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const createWithFirstPrompt = vi.fn(
      async (prompt: string, commandId: string) => ({
        session: {
          ...globalSession,
          id: "created-global-session",
          lastSequence: 4,
        },
        userMessage: {
          id: "created-user-message",
          role: "user" as const,
          text: prompt,
          sequence: 3,
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        firstMessage: {
          id: "created-user-message",
          role: "user" as const,
          text: prompt,
          sequence: 3,
          createdAt: "2026-01-01T00:00:03.000Z",
        },
        turn: {
          id: "global-turn-1",
          commandId,
          state: "running" as const,
          userMessageId: "created-user-message",
          assistantMessageId: "created-assistant-message",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    const submitPrompt = vi.fn(
      async (_sessionId: string, prompt: string, commandId: string) => ({
        session: {
          ...globalSession,
          id: "created-global-session",
          lastSequence: 6,
        },
        userMessage: {
          id: "second-user-message",
          role: "user" as const,
          text: prompt,
          sequence: 5,
          createdAt: "2026-01-01T00:00:05.000Z",
        },
        turn: {
          id: "global-turn-2",
          commandId,
          state: "running" as const,
          userMessageId: "second-user-message",
          assistantMessageId: "second-assistant-message",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    const client = {
      createWithFirstPrompt,
      submitPrompt,
      subscribeEvents: vi.fn((input: { onEvent: (event: unknown) => void }) => {
        onEvent = input.onEvent;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatDraftConversationStore({ client });

    await store.load();
    await store.send("First global prompt");
    onEvent?.({
      sequence: 4,
      eventType: "GlobalChatAgentMessageCompletedV1",
      event: {
        type: "GlobalChatAgentMessageCompletedV1",
        version: 1,
        sessionId: "created-global-session",
        turnId: "global-turn-1",
        messageId: "created-assistant-message",
        text: "settled",
        timestamp: "2026-01-01T00:00:04.000Z",
      },
    });
    await store.send("Second global prompt");

    expect(createWithFirstPrompt).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledWith(
      "created-global-session",
      "Second global prompt",
      expect.any(String),
    );
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "created-global-session" },
      messages: [
        { id: "created-user-message", text: "First global prompt" },
        { id: "created-assistant-message", text: "settled" },
        { id: "second-user-message", text: "Second global prompt" },
      ],
    });
  });

  it("loads an existing Global Chat Session by stable ID and appends a later prompt to the same Session", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    const submitPrompt = vi.fn(
      async (sessionId: string, prompt: string, commandId: string) => ({
        session: {
          ...globalSession,
          id: sessionId,
          updatedAt: "2026-01-01T00:00:06.000Z",
          lastSequence: 7,
        },
        userMessage: {
          id: "existing-session-user-2",
          role: "user" as const,
          text: prompt,
          sequence: 6,
          createdAt: "2026-01-01T00:00:05.000Z",
          commandId,
        },
        turn: {
          id: "existing-session-turn-2",
          commandId,
          state: "running" as const,
          userMessageId: "existing-session-user-2",
          assistantMessageId: "existing-session-assistant-2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5",
          thinkingLevel: "off" as const,
          draftText: "",
          createdAt: "2026-01-01T00:00:05.000Z",
          updatedAt: "2026-01-01T00:00:05.000Z",
        },
      }),
    );
    const client = {
      listMessages: vi.fn(async (sessionId: string) => {
        expect(sessionId).toBe("existing-global-session");
        return {
          session: { ...globalSession, id: "existing-global-session" },
          messages,
        };
      }),
      submitPrompt,
      subscribeEvents: vi.fn((input: { onEvent: (event: unknown) => void }) => {
        onEvent = input.onEvent;
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as GlobalChatSessionClient;
    const store = createGlobalChatSessionSavedConversationStore({
      client,
      sessionId: "existing-global-session",
    });

    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "existing-global-session" },
      status: "ready",
      title: "Global prompt",
      messages: [
        { id: "message-1", text: "First user message" },
        { id: "message-2", text: "Second **assistant** message" },
      ],
    });

    await store.send("Second global prompt");
    onEvent?.({
      sequence: 7,
      eventType: "GlobalChatAgentMessageCompletedV1",
      event: {
        type: "GlobalChatAgentMessageCompletedV1",
        version: 1,
        sessionId: "existing-global-session",
        turnId: "existing-session-turn-2",
        messageId: "existing-session-assistant-2",
        text: "settled second answer",
        timestamp: "2026-01-01T00:00:07.000Z",
      },
    });

    expect(client.createWithFirstPrompt).toBeUndefined();
    expect(submitPrompt).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledWith(
      "existing-global-session",
      "Second global prompt",
      expect.any(String),
    );
    expect(store.getSnapshot()).toMatchObject({
      session: { kind: "global", id: "existing-global-session" },
      title: "Global prompt",
      messages: [
        { id: "message-1", text: "First user message" },
        { id: "message-2", text: "Second **assistant** message" },
        { id: "existing-session-user-2", text: "Second global prompt" },
        { id: "existing-session-assistant-2", text: "settled second answer" },
      ],
    });
  });

  it("preserves failed submissions in the composer projection without retrying", async () => {
    const definitiveError = Object.assign(
      new Error("definitive host rejection"),
      {
        response: { status: 422 },
      },
    );
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      submitPrompt: vi.fn(async () => {
        throw definitiveError;
      }),
      subscribeProjectSessionEvents: vi.fn(() => ({
        cancel: vi.fn(),
        closed: Promise.resolve(),
      })),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    await expect(store.send("fail once")).rejects.toThrow(
      "definitive host rejection",
    );

    expect(client.submitPrompt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({
      error: { message: "definitive host rejection" },
      messages: [
        {
          role: "user",
          text: "fail once",
          status: "failed",
          errorMessage: "definitive host rejection",
        },
      ],
    });
  });

  it("keeps interleaved tool calls associated with their call identities through durable and live updates", async () => {
    let onEvent: ((event: unknown) => void) | undefined;
    let onLiveEvent: ((event: unknown) => void) | undefined;
    const client = {
      listSessionMessages: vi.fn(async () => ({
        session: projectSession,
        messages: [],
      })),
      subscribeProjectSessionEvents: vi.fn((input) => {
        onEvent = input.onEvent;
        onLiveEvent = input.onLiveEvent;
        input.onOpen?.();
        return { cancel: vi.fn(), closed: Promise.resolve() };
      }),
    } as unknown as ProjectSessionClient;
    const store = createProjectSessionSavedConversationStore({
      client,
      sessionId: "project-session-1",
    });

    await store.load();
    onEvent?.({
      sequence: 5,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        messageId: "assistant-1",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp,
      },
    });
    onEvent?.({
      sequence: 6,
      eventType: "AgentToolCallStartedV1",
      event: {
        type: "AgentToolCallStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        toolCallId: "tool-b",
        toolName: "write",
        arguments: { path: "src/b.ts" },
        timestamp,
      },
    });
    onEvent?.({
      sequence: 7,
      eventType: "AgentToolCallStartedV1",
      event: {
        type: "AgentToolCallStartedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        toolCallId: "tool-a",
        toolName: "read",
        arguments: { path: "src/a.ts" },
        timestamp,
      },
    });
    onLiveEvent?.({
      live: true,
      eventType: "AgentToolCallUpdatedV1",
      event: {
        type: "AgentToolCallUpdatedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        toolCallId: "tool-a",
        toolName: "read",
        summary: "Reading file",
        timestamp,
      },
    });
    onEvent?.({
      sequence: 8,
      eventType: "AgentToolCallCompletedV1",
      event: {
        type: "AgentToolCallCompletedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        toolCallId: "tool-a",
        toolName: "read",
        status: "succeeded",
        result: {
          content: [
            { type: "text", text: "A" },
            { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
            {
              type: "unsupported",
              label: "Unsupported tool result content type: html.",
            },
          ],
        },
        timestamp,
      },
    });
    onEvent?.({
      sequence: 9,
      eventType: "AgentToolCallCompletedV1",
      event: {
        type: "AgentToolCallCompletedV1",
        version: 1,
        sessionId: "project-session-1",
        turnId: "turn-1",
        toolCallId: "tool-b",
        toolName: "write",
        status: "failed",
        result: { content: [] },
        timestamp,
      },
    });

    expect(store.getSnapshot().messages[0]?.parts).toMatchObject([
      {
        type: "tool-call",
        toolCallId: "tool-b",
        status: "failed",
        arguments: { path: "src/b.ts" },
        result: { content: [] },
      },
      {
        type: "tool-call",
        toolCallId: "tool-a",
        status: "succeeded",
        progress: "Reading file",
        arguments: { path: "src/a.ts" },
        result: {
          content: [
            { type: "text", text: "A" },
            { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
            {
              type: "unsupported",
              label: "Unsupported tool result content type: html.",
            },
          ],
        },
      },
    ]);
  });

  it("reports empty and query-failure states honestly", async () => {
    const emptyClient = {
      listMessages: vi.fn(async () => ({
        session: globalSession,
        messages: [],
      })),
    } as unknown as GlobalChatSessionClient;
    const failingClient = {
      listMessages: vi.fn(async () => {
        throw new Error("host unavailable");
      }),
    } as unknown as GlobalChatSessionClient;
    const emptyStore = createGlobalChatSessionSavedConversationStore({
      client: emptyClient,
      sessionId: "global-session-1",
    });
    const failingStore = createGlobalChatSessionSavedConversationStore({
      client: failingClient,
      sessionId: "global-session-1",
    });

    await emptyStore.load();
    await expect(failingStore.load()).rejects.toThrow("host unavailable");

    expect(emptyStore.getSnapshot()).toMatchObject({
      status: "empty",
      messages: [],
    });
    expect(failingStore.getSnapshot()).toMatchObject({
      status: "error",
      error: { message: "host unavailable" },
    });
  });
});
