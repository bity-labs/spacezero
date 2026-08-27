import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { createAgentRuntimeClient } from "./agent-runtime-client.js";

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
    "flows:read",
    "flows:write",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
};

describe("Agent Runtime client", () => {
  it("lists sanitized model descriptors through the generated Host API", async () => {
    const body = {
      models: [
        {
          providerId: "anthropic",
          providerDisplayName: "Anthropic",
          modelId: "claude-sonnet-4-5",
          displayName: "Claude Sonnet 4.5",
          authenticated: true,
          available: true,
          reasoningSupported: true,
          supportedThinkingLevels: ["off", "high"],
          contextWindow: 200000,
          maxTokens: 8192,
        },
      ],
    };
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        expect(request.url).toBe(
          "http://127.0.0.1:1234/v1/agent-runtime/models",
        );
        expect(request.method).toBe("GET");
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    const client = createAgentRuntimeClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.listAgentRuntimeModels()).resolves.toEqual(body);
  });
});
