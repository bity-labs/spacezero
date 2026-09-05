import { describe, expect, it, vi } from "vitest";
import {
  createGlobalChatDraftConversationStore,
  createGlobalChatSessionSavedConversationStore,
  createProjectSessionSavedConversationStore,
  createSavedConversationStore,
  type SavedConversationProjection,
} from "./saved-conversation-projection.js";
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
              providerId: "anthropic",
              modelId: "claude-sonnet-4-5",
              thinkingLevel: "off" as const,
              draftText: "",
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
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            thinkingLevel: "off" as const,
            draftText: "authoritative draft",
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
