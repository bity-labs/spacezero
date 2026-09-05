import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app.js";

const timestamp = "2026-01-01T00:00:00.000Z";
const projectSessionId = "11111111-1111-4111-8111-111111111111";
const globalChatSessionId = "22222222-2222-4222-8222-222222222222";
const descriptor: HostConnectionDescriptor = {
  endpoint: "http://127.0.0.1:1234/",
  instanceId: "0123456789abcdef0123456789abcdef",
  protocolVersion: "4",
  clientCapability: "abcdefghijklmnopqrstuvwxyzabcdef0123456789ABCD",
  expiresAt: "2027-01-01T00:00:00.000Z",
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

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });

const hostConnectedStream = () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `id: 1\nevent: host.connected\ndata: ${JSON.stringify({
              type: "host.connected",
              instanceId: descriptor.instanceId,
              protocolVersion: descriptor.protocolVersion,
            })}\n\n`,
          ),
        );
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );

const requestFrom = (input: RequestInfo | URL, init?: RequestInit): Request =>
  input instanceof Request ? input : new Request(input, init);

const installHostBackedConversationFetch = () => {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestFrom(input, init);
      requests.push(request);
      if (request.url === "http://127.0.0.1:1234/v1/connection")
        return json({
          instanceId: descriptor.instanceId,
          protocolVersion: descriptor.protocolVersion,
          status: "ready",
        });
      if (request.url === "http://127.0.0.1:1234/v1/events")
        return hostConnectedStream();
      if (
        request.url ===
        `http://127.0.0.1:1234/v1/project-sessions/${projectSessionId}/messages`
      )
        return json({
          session: {
            id: projectSessionId,
            projectId: "33333333-3333-4333-8333-333333333333",
            name: "margaux",
            state: "ready",
            sourceBranch: "main",
            sourceDetached: false,
            sourceCommit: "a".repeat(40),
            uncommittedChangesExcluded: false,
            managedBranch: `spacezero/margaux-${projectSessionId}`,
            createdAt: timestamp,
            updatedAt: timestamp,
            lastSequence: 2,
          },
          messages: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              role: "user",
              text: "Project saved question",
              sequence: 1,
              createdAt: timestamp,
            },
            {
              id: "55555555-5555-4555-8555-555555555555",
              role: "assistant",
              text: "Project saved answer",
              sequence: 2,
              createdAt: timestamp,
            },
          ],
        });
      if (
        request.url ===
        `http://127.0.0.1:1234/v1/global-chat-sessions/${globalChatSessionId}/messages`
      )
        return json({
          session: {
            id: globalChatSessionId,
            title: "Global prompt",
            archived: false,
            createdAt: timestamp,
            updatedAt: timestamp,
            lastSequence: 1,
          },
          messages: [
            {
              id: "66666666-6666-4666-8666-666666666666",
              role: "assistant",
              text: "Global saved answer",
              sequence: 1,
              createdAt: timestamp,
            },
          ],
        });
      return new Response("not found", { status: 404 });
    }),
  );
  return requests;
};

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    window.location.hash = "#/";
    Object.defineProperty(window, "spacezero", {
      value: {
        getAppVersion: vi.fn(),
        getLocalHostConnection: vi.fn().mockRejectedValue(new Error("no host")),
      },
      configurable: true,
    });
  });

  it("renders the workspace shell and connects to the Local Host", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toBeInTheDocument();
      expect(screen.getByLabelText("Workspace sidebar")).toBeInTheDocument();
      expect(
        screen.getByRole("main", { name: "Workspace" }),
      ).toBeInTheDocument();
    });
  });

  it("opens Agent Capabilities from the workspace sidebar", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Agent Capabilities" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Agent Capabilities" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Agent Capabilities",
    );
    expect(
      screen.getByLabelText("Agent capability configuration scope"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Skills" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Search skills")).toBeInTheDocument();
  });

  it("mounts Project Session saved conversation routes through authenticated Host queries", async () => {
    window.location.hash = `#/project-sessions/${projectSessionId}`;
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const requests = installHostBackedConversationFetch();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: projectSessionId }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Project saved question"),
    ).toBeInTheDocument();
    expect(screen.getByText("Project saved answer")).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Project Session",
    );
    const messageRequest = await waitFor(() => {
      const request = requests.find((current) =>
        current.url.endsWith(
          `/v1/project-sessions/${projectSessionId}/messages`,
        ),
      );
      if (!request) throw new Error("Project Session message request missing");
      return request;
    });
    expect(messageRequest.headers.get("authorization")).toBe(
      `Bearer ${descriptor.clientCapability}`,
    );
    expect(messageRequest.url).not.toContain(descriptor.clientCapability);
    expect(getLocalHostConnection).toHaveBeenCalled();
  });

  it("mounts Global Chat Session saved conversation routes through authenticated Host queries", async () => {
    window.location.hash = `#/global-chat-sessions/${globalChatSessionId}`;
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const requests = installHostBackedConversationFetch();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: globalChatSessionId }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Global saved answer")).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Global Chat Session",
    );
    const messageRequest = await waitFor(() => {
      const request = requests.find((current) =>
        current.url.endsWith(
          `/v1/global-chat-sessions/${globalChatSessionId}/messages`,
        ),
      );
      if (!request)
        throw new Error("Global Chat Session message request missing");
      return request;
    });
    expect(messageRequest.headers.get("authorization")).toBe(
      `Bearer ${descriptor.clientCapability}`,
    );
    expect(messageRequest.url).not.toContain(descriptor.clientCapability);
    expect(getLocalHostConnection).toHaveBeenCalled();
  });

  it("opens the add capability dialog and toggles row management actions", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Agent Capabilities" }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new skill" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create a new subagent" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByRole("button", { name: "Edit ai-elements" }),
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    expect(
      screen.getByRole("button", { name: "Edit ai-elements" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete ai-elements" }),
    ).toBeInTheDocument();
  });
});
