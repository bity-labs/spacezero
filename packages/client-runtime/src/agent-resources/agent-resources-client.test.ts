import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

import { createAgentResourcesClient } from "./agent-resources-client.js";

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
const sessionId = "22222222-2222-4222-8222-222222222222";

const skill = {
  name: "release-plan",
  description: "Draft a release plan.",
  scope: "spacezero_home" as const,
  digest: "a".repeat(64),
  enabled: true,
  trusted: true,
};

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });

describe("Agent resources client", () => {
  it("lists Project Session skills through the generated Host API", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe(
        `http://127.0.0.1:1234/v1/project-sessions/${sessionId}/skills`,
      );
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${descriptor.clientCapability}`,
      );
      return json({ sessionId, skills: [skill], diagnostics: [] });
    });
    const client = createAgentResourcesClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(client.listSessionSkills(sessionId)).resolves.toEqual({
      sessionId,
      skills: [skill],
      diagnostics: [],
    });
  });

  it("lists Global Chat Session skills through the generated Host API", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe(
        `http://127.0.0.1:1234/v1/global-chat-sessions/${sessionId}/skills`,
      );
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBe(
        `Bearer ${descriptor.clientCapability}`,
      );
      return json({ sessionId, skills: [skill], diagnostics: [] });
    });
    const client = createAgentResourcesClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.listGlobalChatSessionSkills(sessionId),
    ).resolves.toEqual({
      sessionId,
      skills: [skill],
      diagnostics: [],
    });
  });

  it("propagates typed Host error bodies from Global Chat skills listing", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "global_chat_session_not_found",
            message: "The selected Global Chat Session does not exist.",
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
    );
    const client = createAgentResourcesClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.listGlobalChatSessionSkills(sessionId),
    ).rejects.toMatchObject({ code: "global_chat_session_not_found" });
  });
});
