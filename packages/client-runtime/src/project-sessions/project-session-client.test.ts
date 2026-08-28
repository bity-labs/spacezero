import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { createProjectSessionClient } from "./project-session-client.js";

const descriptor: HostConnectionDescriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "3",
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
    "agent-resources:read",
    "flows:read",
    "flows:write",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
};
const uuid = "11111111-1111-4111-8111-111111111111";
const session = {
  id: uuid,
  projectId: uuid,
  name: "margaux",
  state: "ready" as const,
  sourceBranch: "main",
  sourceDetached: false,
  sourceCommit: "a".repeat(40),
  uncommittedChangesExcluded: false,
  managedBranch: `spacezero/margaux-${uuid}`,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastSequence: 4,
};
const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
const sse = (events: readonly unknown[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events as readonly { sequence: number }[]) {
          controller.enqueue(
            new TextEncoder().encode(
              `id: ${event.sequence}\nevent: project-session.event\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
const requestDetails = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init);
  return {
    url: request.url,
    method: request.method,
    authorization: request.headers.get("authorization"),
    body: ["POST", "PUT"].includes(request.method)
      ? await request.json()
      : undefined,
  };
};

describe("Project Session client", () => {
  it("lists Project Sessions through the generated Host API", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe("http://127.0.0.1:1234/v1/project-sessions");
        expect(request.method).toBe("GET");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return json({ sessions: [session] });
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.listProjectSessions()).resolves.toEqual([session]);
  });

  it("creates a Project Session with a stable command ID", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe("http://127.0.0.1:1234/v1/project-sessions");
        expect(request.method).toBe("POST");
        expect(request.body).toEqual({ commandId: uuid, projectId: uuid });
        return json({ session });
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => uuid,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.createProjectSession(uuid)).resolves.toEqual({
      session,
    });
  });

  it("gets and updates Session runtime configuration", async () => {
    const runtime = {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      defaultThinkingLevel: "off" as const,
      revision: 1,
    };
    const updated = {
      ...runtime,
      modelId: "claude-opus-4-1",
      defaultThinkingLevel: "high" as const,
      revision: 2,
    };
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        if (request.method === "GET") {
          expect(request.url).toBe(
            `http://127.0.0.1:1234/v1/project-sessions/${uuid}/runtime`,
          );
          return json({ session, runtime });
        }
        expect(request.method).toBe("PUT");
        expect(request.url).toBe(
          `http://127.0.0.1:1234/v1/project-sessions/${uuid}/runtime`,
        );
        expect(request.body).toEqual({
          commandId: uuid,
          providerId: "anthropic",
          modelId: "claude-opus-4-1",
          defaultThinkingLevel: "high",
          expectedRevision: 1,
        });
        return json({ session, runtime: updated });
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => uuid,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.getRuntime(uuid)).resolves.toEqual({
      session,
      runtime,
    });
    await expect(
      client.updateRuntime(uuid, {
        providerId: "anthropic",
        modelId: "claude-opus-4-1",
        defaultThinkingLevel: "high",
        expectedRevision: 1,
      }),
    ).resolves.toEqual({ session, runtime: updated });
  });

  it("submits a prompt to the Session prompt endpoint", async () => {
    const userMessage = {
      id: uuid,
      role: "user",
      text: "Build the wine list view",
      sequence: 5,
      createdAt: "2026-01-01T00:01:00.000Z",
    };
    const turn = {
      id: "22222222-2222-4222-8222-222222222222",
      commandId: uuid,
      state: "running",
      userMessageId: uuid,
      assistantMessageId: "33333333-3333-4333-8333-333333333333",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5",
      thinkingLevel: "off",
      draftText: "",
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    const result = { session, turn, userMessage };
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe(
          `http://127.0.0.1:1234/v1/project-sessions/${uuid}/prompts`,
        );
        expect(request.method).toBe("POST");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        expect(request.body).toEqual({
          commandId: uuid,
          prompt: "Build the wine list view",
        });
        return json(result);
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => uuid,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      client.submitPrompt(uuid, "Build the wine list view"),
    ).resolves.toEqual(result);
  });

  it("subscribes to Session events with Authorization headers, SSE IDs, live frames, and reconnect cursors", async () => {
    const firstEvent = {
      sequence: 5,
      eventType: "UserMessageSubmittedV1",
      event: {
        type: "UserMessageSubmittedV1" as const,
        version: 1 as const,
        sessionId: uuid,
        messageId: uuid,
        commandId: uuid,
        prompt: "one",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    const secondEvent = {
      sequence: 6,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1" as const,
        version: 1 as const,
        sessionId: uuid,
        turnId: "22222222-2222-4222-8222-222222222222",
        messageId: "33333333-3333-4333-8333-333333333333",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    const liveEvent = {
      live: true as const,
      eventType: "AssistantTextDeltaV1",
      event: {
        type: "AssistantTextDeltaV1" as const,
        version: 1 as const,
        sessionId: uuid,
        turnId: "22222222-2222-4222-8222-222222222222",
        messageId: "33333333-3333-4333-8333-333333333333",
        text: "hello",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    const requests: Request[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push(request);
        if (requests.length === 1)
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `id: ${firstEvent.sequence}\nevent: project-session.event\ndata: ${JSON.stringify(firstEvent)}\n\n`,
                  ),
                );
                controller.enqueue(
                  new TextEncoder().encode(
                    `event: project-session.live\ndata: ${JSON.stringify(liveEvent)}\n\n`,
                  ),
                );
                controller.close();
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        return sse([secondEvent]);
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });
    const received: unknown[] = [];
    const live: unknown[] = [];
    const subscription = client.subscribeProjectSessionEvents({
      sessionId: uuid,
      after: 4,
      onEvent: (event) => {
        received.push(event);
        if (event.sequence === 6) subscription.cancel();
      },
      onLiveEvent: (event) => live.push(event),
    });
    await subscription.closed;

    expect(received).toEqual([firstEvent, secondEvent]);
    expect(live).toEqual([liveEvent]);
    expect(requests.map((request) => request.url)).toEqual([
      `http://127.0.0.1:1234/v1/project-sessions/${uuid}/events?after=4`,
      `http://127.0.0.1:1234/v1/project-sessions/${uuid}/events?after=5`,
    ]);
    expect(
      requests.every(
        (request) =>
          request.headers.get("authorization") ===
          `Bearer ${descriptor.clientCapability}`,
      ),
    ).toBe(true);
    expect(
      requests.every(
        (request) => !request.url.includes(descriptor.clientCapability),
      ),
    ).toBe(true);
  });

  it("reacquires descriptors and resumes after transient subscription failures", async () => {
    const event = {
      sequence: 8,
      eventType: "AgentTurnStartedV1",
      event: {
        type: "AgentTurnStartedV1" as const,
        version: 1 as const,
        sessionId: uuid,
        turnId: "22222222-2222-4222-8222-222222222222",
        messageId: uuid,
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5",
        thinkingLevel: "off",
        timestamp: "2026-01-01T00:01:00.000Z",
      },
    };
    const renewed = {
      ...descriptor,
      clientCapability: "renewed-abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    };
    const acquireDescriptor = vi
      .fn<() => Promise<typeof descriptor>>()
      .mockResolvedValueOnce(descriptor)
      .mockResolvedValueOnce(renewed);
    const requests: Request[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requests.push(request);
        if (requests.length === 1) throw new Error("temporary network error");
        return sse([event]);
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: acquireDescriptor,
      fetch: fetch as typeof globalThis.fetch,
    });
    const errors: Error[] = [];
    const received: unknown[] = [];
    const subscription = client.subscribeProjectSessionEvents({
      sessionId: uuid,
      after: 7,
      onEvent: (receivedEvent) => {
        received.push(receivedEvent);
        subscription.cancel();
      },
      onError: (error) => errors.push(error),
    });

    await subscription.closed;

    expect(errors).toHaveLength(1);
    expect(received).toEqual([event]);
    expect(acquireDescriptor).toHaveBeenCalledTimes(2);
    expect(requests.map((request) => request.url)).toEqual([
      `http://127.0.0.1:1234/v1/project-sessions/${uuid}/events?after=7`,
      `http://127.0.0.1:1234/v1/project-sessions/${uuid}/events?after=7`,
    ]);
    expect(requests[1]?.headers.get("authorization")).toBe(
      `Bearer ${renewed.clientCapability}`,
    );
  });

  it("lists Session messages with the Session projection cursor", async () => {
    const messages: [] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe(
          `http://127.0.0.1:1234/v1/project-sessions/${uuid}/messages`,
        );
        expect(request.method).toBe("GET");
        return json({ session, messages });
      },
    );
    const client = createProjectSessionClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.listSessionMessages(uuid)).resolves.toEqual({
      session,
      messages,
    });
  });
});
