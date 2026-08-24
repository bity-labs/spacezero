import { describe, expect, it, vi } from "vitest";
import { createLocalHostConnectionClient } from "./local-host-connection-client.js";

const descriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "2" as const,
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
  ] as const,
};
const sse = (): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `id: 1\nevent: host.connected\ndata: {"type":"host.connected","instanceId":"${descriptor.instanceId}","protocolVersion":"2"}\n\n`,
        ),
      );
    },
  });

describe("createLocalHostConnectionClient", () => {
  it("uses Authorization headers, avoids URL tokens, and returns plain query/event values", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/v1/connection"))
          return new Response(
            JSON.stringify({
              instanceId: descriptor.instanceId,
              protocolVersion: "2",
              status: "ready",
            }),
          );
        return new Response(sse(), {
          headers: { "content-type": "text/event-stream" },
        });
      },
    );
    const client = createLocalHostConnectionClient({
      acquireDescriptor: async () => descriptor,
      fetch: fetchMock as typeof fetch,
    });
    await expect(client.connect()).resolves.toEqual({
      snapshot: {
        instanceId: descriptor.instanceId,
        protocolVersion: "2",
        status: "ready",
      },
      event: {
        type: "host.connected",
        instanceId: descriptor.instanceId,
        protocolVersion: "2",
      },
    });
    expect(requests).toHaveLength(2);
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
    client.dispose();
  });

  it("acquires one replacement capability after an unauthorized response", async () => {
    const renewed = {
      ...descriptor,
      clientCapability: "renewed-abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    };
    const acquireDescriptor = vi
      .fn<() => Promise<typeof descriptor>>()
      .mockResolvedValueOnce(descriptor)
      .mockResolvedValueOnce(renewed);
    let queryCount = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (request.url.endsWith("/v1/connection")) {
          queryCount += 1;
          if (queryCount === 1)
            return new Response(
              JSON.stringify({
                code: "unauthorized",
                message: "unauthorized",
              }),
              {
                status: 401,
                headers: { "content-type": "application/json" },
              },
            );
          return new Response(
            JSON.stringify({
              instanceId: descriptor.instanceId,
              protocolVersion: "2",
              status: "ready",
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${renewed.clientCapability}`,
        );
        return new Response(sse(), {
          headers: { "content-type": "text/event-stream" },
        });
      },
    );
    const client = createLocalHostConnectionClient({
      acquireDescriptor,
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.connect()).resolves.toMatchObject({
      snapshot: { status: "ready" },
      event: { type: "host.connected" },
    });
    expect(acquireDescriptor).toHaveBeenCalledTimes(2);
    expect(queryCount).toBe(2);
    client.dispose();
  });
});
