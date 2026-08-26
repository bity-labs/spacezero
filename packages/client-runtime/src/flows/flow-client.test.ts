import { describe, expect, it, vi } from "vitest";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { FlowClientError, createFlowClient } from "./flow-client.js";

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
    "flows:read",
    "flows:write",
    "project-sessions:read",
    "project-sessions:create",
    "project-sessions:prompt",
  ],
};

const sse = (frames: readonly unknown[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(
            new TextEncoder().encode(
              `id: ${(frame as { sequence: number }).sequence}\nevent: flow.event\ndata: ${JSON.stringify(frame)}\n\n`,
            ),
          );
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );

const request = async (input: RequestInfo | URL, init?: RequestInit) => {
  const current = input instanceof Request ? input : new Request(input, init);
  return {
    url: current.url,
    method: current.method,
    authorization: current.headers.get("authorization"),
    body: await current
      .clone()
      .json()
      .catch(() => undefined),
  };
};

describe("Flow client", () => {
  it("subscribes to flow events with bearer auth", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const details = await request(input, init);
        expect(details.url).toBe(
          "http://127.0.0.1:1234/v1/flows/flow_123/events?after=0",
        );
        expect(details.authorization).toBe(
          `Bearer ${descriptor.clientCapability}`,
        );
        return sse([
          { flowId: "flow_123", sequence: 1, event: { type: "flow.started" } },
          {
            flowId: "flow_123",
            sequence: 2,
            event: { type: "flow.completed" },
          },
        ]);
      },
    );
    const onEvent = vi.fn();
    const client = createFlowClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    const subscription = client.subscribeFlowEvents({
      flowId: "flow_123",
      onEvent,
    });
    await subscription.closed;

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenLastCalledWith({
      flowId: "flow_123",
      sequence: 2,
      event: { type: "flow.completed" },
    });
  });

  it("responds to prompts and cancels flows without leaking submitted responses", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    const client = createFlowClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: fetch as typeof globalThis.fetch,
    });

    await client.respondToPrompt(
      "flow_123",
      "prompt_123",
      "secret-code-marker",
    );
    await client.cancelFlow("flow_123");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      new URL(
        "http://127.0.0.1:1234/v1/flows/flow_123/prompts/prompt_123/responses",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ response: "secret-code-marker" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL("http://127.0.0.1:1234/v1/flows/flow_123/cancel"),
      expect.objectContaining({ method: "POST" }),
    );

    const failing = createFlowClient({
      getConnectionDescriptor: async () => descriptor,
      fetch: vi.fn(
        async () => new Response("no", { status: 500 }),
      ) as typeof globalThis.fetch,
    });
    let caught: unknown;
    try {
      await failing.respondToPrompt("flow_123", "prompt_123", "SECRET-CODE");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FlowClientError);
    expect(String(caught)).not.toContain("SECRET-CODE");
  });
});
