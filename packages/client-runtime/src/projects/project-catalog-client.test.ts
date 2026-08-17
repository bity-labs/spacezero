import { describe, expect, it, vi } from "vitest";
import { createProjectCatalogClient } from "./project-catalog-client.js";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";

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
    body: request.method === "POST" ? await request.json() : undefined,
  };
};

describe("Project catalog client", () => {
  it("lists Projects with the generated Host API method and bearer header", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe("http://127.0.0.1:1234/v1/projects");
        expect(request.method).toBe("GET");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return json({ projects: [] });
      },
    );
    const client = createProjectCatalogClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.listProjects()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("registers a Project with one generated command ID in the request body", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = await requestDetails(input, init);
        expect(request.url).toBe("http://127.0.0.1:1234/v1/projects");
        expect(request.method).toBe("POST");
        expect(request.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        expect(request.body).toEqual({
          commandId: "11111111-1111-4111-8111-111111111111",
          path: "/work/repo",
        });
        return json({
          outcome: "registered",
          project: {
            id: "22222222-2222-4222-8222-222222222222",
            displayName: "repo",
            canonicalPath: "/work/repo",
            registeredHeadCommit: "a".repeat(40),
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        });
      },
    );
    const createCommandId = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    const client = createProjectCatalogClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId,
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(client.registerProject("/work/repo")).resolves.toMatchObject({
      outcome: "registered",
      project: { displayName: "repo" },
    });
    expect(createCommandId).toHaveBeenCalledTimes(1);
  });

  it("rejects with typed static Project error bodies", async () => {
    const client = createProjectCatalogClient({
      getConnectionDescriptor: async () => descriptor,
      createCommandId: () => "11111111-1111-4111-8111-111111111111",
      fetch: (async () =>
        json(
          { code: "not_git_repository", message: "Choose a Git repository." },
          { status: 422 },
        )) as typeof globalThis.fetch,
    });

    await expect(client.registerProject("/not/git")).rejects.toMatchObject({
      code: "not_git_repository",
      message: "Choose a Git repository.",
    });
  });
});
