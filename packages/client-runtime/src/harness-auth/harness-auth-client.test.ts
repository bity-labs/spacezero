import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import {
  HarnessAuthClientError,
  createHarnessAuthClient,
} from "./harness-auth-client.js";

const descriptor: HostConnectionDescriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "2",
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  scopes: [
    "host:connection:read",
    "host:events:subscribe",
    "projects:read",
    "projects:register",
    "harness-auth:read",
    "harness-auth:write",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
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
    body: request.method === "PUT" ? await request.json() : undefined,
  };
};

describe("Harness auth client", () => {
  it("lists provider auth options with the bearer header", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe(
          "http://127.0.0.1:1234/v1/harness-auth/providers",
        );
        expect(request.method).toBe("GET");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return json({
          providers: [
            {
              providerId: "anthropic",
              displayName: "Anthropic",
              authMethods: ["api_key", "oauth"],
              configured: true,
              configuredMethod: "api_key",
            },
            {
              providerId: "openai",
              displayName: "OpenAI",
              authMethods: ["api_key"],
              configured: false,
            },
          ],
        });
      },
    );
    const client = createHarnessAuthClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.listProviderAuthOptions()).resolves.toEqual([
      {
        providerId: "anthropic",
        displayName: "Anthropic",
        authMethods: ["api_key", "oauth"],
        configured: true,
        configuredMethod: "api_key",
      },
      {
        providerId: "openai",
        displayName: "OpenAI",
        authMethods: ["api_key"],
        configured: false,
      },
    ]);
  });

  it("reads provider status with the bearer header", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe(
          "http://127.0.0.1:1234/v1/harness-auth/providers/anthropic/status",
        );
        expect(request.method).toBe("GET");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return json({
          status: {
            providerId: "anthropic",
            configured: false,
            source: "missing",
          },
        });
      },
    );
    const client = createHarnessAuthClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.getProviderAuthStatus("anthropic")).resolves.toEqual({
      providerId: "anthropic",
      configured: false,
      source: "missing",
    });
  });

  it("sets and removes provider API keys without returning the submitted secret", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        if (request.method === "PUT") {
          expect(request.body).toEqual({ apiKey: "secret-marker" });
        }
        return json({
          status: {
            providerId: "anthropic",
            configured: request.method === "PUT",
            source: request.method === "PUT" ? "stored" : "missing",
          },
        });
      },
    );
    const client = createHarnessAuthClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      client.setProviderApiKey("anthropic", "secret-marker"),
    ).resolves.toEqual({
      providerId: "anthropic",
      configured: true,
      source: "stored",
    });
    await expect(client.removeProviderApiKey("anthropic")).resolves.toEqual({
      providerId: "anthropic",
      configured: false,
      source: "missing",
    });
  });

  it("redacts submitted secrets from transport failures", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    const client = createHarnessAuthClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    let caught: unknown;
    try {
      await client.setProviderApiKey("anthropic", "SECRET-MARKER");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HarnessAuthClientError);
    expect(String(caught)).not.toContain("SECRET-MARKER");
    expect(JSON.stringify(caught)).not.toContain("SECRET-MARKER");
  });
});
