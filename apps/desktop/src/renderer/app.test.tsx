import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./app.js";

const descriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "1" as const,
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  scopes: [
    "host:connection:read",
    "host:events:subscribe",
    "projects:read",
    "projects:register",
    "project-sessions:read",
    "project-sessions:create",
  ] as const,
};

describe("App", () => {
  it("renders connected after the version, query, and SSE tracer succeed", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `id: 1\nevent: host.connected\ndata: {"type":"host.connected","instanceId":"${descriptor.instanceId}","protocolVersion":"1"}\n\n`,
          ),
        );
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/v1/connection"))
          return new Response(
            JSON.stringify({
              instanceId: descriptor.instanceId,
              protocolVersion: "1",
              status: "ready",
            }),
          );
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      });
    Object.defineProperty(window, "spacezero", {
      value: {
        getAppVersion: vi.fn().mockResolvedValue("0.0.0"),
        getLocalHostConnection: vi.fn().mockResolvedValue(descriptor),
      },
      configurable: true,
    });
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Space Zero" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Authenticated connectivity tracer"),
    ).toBeInTheDocument();
    expect(await screen.findByText("0.0.0")).toBeInTheDocument();
    expect(await screen.findByText("connected")).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("renders unavailable when issuance fails", async () => {
    Object.defineProperty(window, "spacezero", {
      value: {
        getAppVersion: vi.fn().mockResolvedValue("0.0.0"),
        getLocalHostConnection: vi.fn().mockRejectedValue(new Error("no host")),
      },
      configurable: true,
    });
    render(<App />);
    expect(await screen.findByText("unavailable")).toBeInTheDocument();
  });
});
