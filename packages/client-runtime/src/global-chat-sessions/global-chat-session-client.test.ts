import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

import { createGlobalChatSessionClient } from "./global-chat-session-client.js";

const descriptor: HostConnectionDescriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "4",
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  scopes: [
    "host:connection:read",
    "host:events:subscribe",
    "projects:read",
    "projects:register",
    "harness-auth:read",
    "harness-auth:write",
    "agent-runtime:read",
    "agent-runtime:write",
    "agent-resources:read",
    "flows:read",
    "flows:write",
    "global-chat-sessions:create",
    "global-chat-sessions:read",
    "global-chat-sessions:prompt",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
};
const commandId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const turnId = "33333333-3333-4333-8333-333333333333";
const userMessageId = "44444444-4444-4444-8444-444444444444";
const assistantMessageId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-01-01T00:00:00.000Z";

const createResult = {
  session: {
    id: sessionId,
    title: "First global prompt",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSequence: 1,
  },
  turn: {
    id: turnId,
    commandId,
    state: "running",
    userMessageId,
    assistantMessageId,
    assistantMessageIds: [assistantMessageId],
    providerId: "anthropic",
    modelId: "claude-sonnet-4-5",
    thinkingLevel: "off",
    draftText: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  userMessage: {
    id: userMessageId,
    role: "user",
    text: "First global prompt",
    sequence: 1,
    createdAt: timestamp,
  },
  firstMessage: {
    id: userMessageId,
    role: "user",
    text: "First global prompt",
    sequence: 1,
    createdAt: timestamp,
  },
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("Global Chat Session client", () => {
  it("lists Global Chat Sessions through the generated Host API", async () => {
    const session = createResult.session;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(request.url).toBe(
          "http://127.0.0.1:1234/v1/global-chat-sessions",
        );
        expect(request.method).toBe("GET");
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return json({ sessions: [session] });
      },
    );
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(client.listGlobalChatSessions()).resolves.toEqual([session]);
  });

  it("creates a Global Chat Session with the first prompt, bearer header, and stable command ID", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(request.url).toBe(
          "http://127.0.0.1:1234/v1/global-chat-sessions",
        );
        expect(request.method).toBe("POST");
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        expect(await request.json()).toEqual({
          commandId,
          firstPrompt: "First global prompt",
        });
        return json(createResult);
      },
    );
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.createWithFirstPrompt("First global prompt"),
    ).resolves.toEqual(createResult);
  });

  it("propagates typed Host error bodies from first-prompt creation", async () => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: (async () =>
        json(
          {
            code: "command_id_conflict",
            message:
              "This Global Chat Session command ID was already used for different input.",
          },
          { status: 409 },
        )) as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.createWithFirstPrompt("First global prompt", commandId),
    ).rejects.toMatchObject({
      code: "command_id_conflict",
      message:
        "This Global Chat Session command ID was already used for different input.",
    });
  });

  it("archives and unarchives a Global Chat Session through the generated Host API", async () => {
    const archivedSession = {
      ...createResult.session,
      archived: true,
      archivedAt: timestamp,
    };
    const requests: Request[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push(request);
        if (request.method === "POST")
          return json({
            session: request.url.endsWith("/archive")
              ? archivedSession
              : createResult.session,
          });
        return json({ session: createResult.session });
      },
    );
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(client.archiveSession(sessionId)).resolves.toEqual({
      session: archivedSession,
    });
    await expect(
      client.unarchiveSession(sessionId),
    ).resolves.toEqual({ session: createResult.session });

    expect(
      requests.map((request) => ({
        url: request.url,
        method: request.method,
      })),
    ).toEqual([
      {
        url: `http://127.0.0.1:1234/v1/global-chat-sessions/${sessionId}/archive`,
        method: "POST",
      },
      {
        url: `http://127.0.0.1:1234/v1/global-chat-sessions/${sessionId}/unarchive`,
        method: "POST",
      },
    ]);
    for (const request of requests) {
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${descriptor.clientCapability}`,
      );
      await expect(request.json()).resolves.toEqual({ commandId });
    }
  });

  it("propagates typed archived-state errors from unarchive", async () => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: (async () =>
        json(
          {
            code: "global_chat_session_turn_in_progress",
            message:
              "An agent turn is already in progress for this Global Chat Session.",
          },
          { status: 409 },
        )) as unknown as typeof globalThis.fetch,
    });

    await expect(client.unarchiveSession(sessionId)).rejects.toMatchObject({
      code: "global_chat_session_turn_in_progress",
      message:
        "An agent turn is already in progress for this Global Chat Session.",
    });
  });

  it("renames a Global Chat Session through the generated Host API", async () => {
    const renamedSession = { ...createResult.session, title: "Renamed chat" };
    const requests: Request[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push(request);
        return json({ session: renamedSession });
      },
    );
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.renameSession(sessionId, "  Renamed chat  "),
    ).resolves.toEqual({ session: renamedSession });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      `http://127.0.0.1:1234/v1/global-chat-sessions/${sessionId}/rename`,
    );
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("authorization")).toBe(
      `Bearer ${descriptor.clientCapability}`,
    );
    await expect(requests[0]?.json()).resolves.toEqual({
      commandId,
      title: "  Renamed chat  ",
    });
  });

  it("propagates typed rename validation errors", async () => {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => commandId,
      fetch: (async () =>
        json(
          {
            code: "global_chat_session_title_invalid",
            message:
              "Chat titles cannot be empty and must be 60 characters or fewer on a single line.",
          },
          { status: 400 },
        )) as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.renameSession(sessionId, "x".repeat(61)),
    ).rejects.toMatchObject({
      code: "global_chat_session_title_invalid",
      message:
        "Chat titles cannot be empty and must be 60 characters or fewer on a single line.",
    });
  });
});
