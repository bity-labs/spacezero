import { describe, expect, it, vi } from "vitest";
import {
  createGlobalChatSessionSavedConversationStore,
  createProjectSessionSavedConversationStore,
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
  it("loads Project Session saved messages through the Project Session client without enabling actions", async () => {
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
    expect(store.getSnapshot().messages).toEqual([
      {
        id: "message-1",
        role: "user",
        text: "First user message",
        sequence: 2,
        createdAt: "2026-01-01T00:00:01.000Z",
      },
      {
        id: "message-2",
        role: "assistant",
        text: "Second **assistant** message",
        sequence: 3,
        createdAt: "2026-01-01T00:00:02.000Z",
      },
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
