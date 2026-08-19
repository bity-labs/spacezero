import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { createProjectSessionClient } from "./project-session-client.js";

const descriptor: HostConnectionDescriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "1",
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  scopes: [
    "host:connection:read",
    "host:events:subscribe",
    "projects:read",
    "projects:register",
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
const requestDetails = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init);
  return {
    url: request.url,
    method: request.method,
    authorization: request.headers.get("authorization"),
    body: request.method === "POST" ? await request.json() : undefined,
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

  it("submits a prompt to the Session prompt endpoint", async () => {
    const userMessage = {
      id: uuid,
      role: "user",
      text: "Build the wine list view",
      sequence: 5,
      createdAt: "2026-01-01T00:01:00.000Z",
    };
    const agentMessage = {
      id: "22222222-2222-4222-8222-222222222222",
      role: "assistant",
      text: "Echo: Build the wine list view",
      sequence: 7,
      createdAt: "2026-01-01T00:01:01.000Z",
    };
    const result = { session, userMessage, agentMessage };
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
