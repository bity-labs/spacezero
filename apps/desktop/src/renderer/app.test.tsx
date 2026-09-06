import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
        new URL(request.url).pathname ===
        `/v1/project-sessions/${projectSessionId}/messages`
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
        `http://127.0.0.1:1234/v1/project-sessions/${projectSessionId}/follow-ups`
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
          followUps: [],
        });
      if (
        new URL(request.url).pathname ===
        `/v1/global-chat-sessions/${globalChatSessionId}/messages`
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
      if (
        request.url ===
        `http://127.0.0.1:1234/v1/global-chat-sessions/${globalChatSessionId}/follow-ups`
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
          followUps: [],
        });
      return new Response("not found", { status: 404 });
    }),
  );
  return requests;
};

type DraftRequestDetails = {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
};

const createdGlobalChatSessionId = "77777777-7777-4777-8777-777777777777";
const createdGlobalChatCommandId = "99999999-9999-4999-8999-999999999999";
const createdGlobalChatTurnId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const createdGlobalChatUserMessageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const createdGlobalChatAssistantMessageId =
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const createdGlobalChatSession = {
  id: createdGlobalChatSessionId,
  title: "First global prompt",
  archived: false,
  createdAt: timestamp,
  updatedAt: timestamp,
  lastSequence: 1,
};
const createdGlobalChatTurn = {
  id: createdGlobalChatTurnId,
  commandId: createdGlobalChatCommandId,
  state: "running",
  userMessageId: createdGlobalChatUserMessageId,
  assistantMessageId: createdGlobalChatAssistantMessageId,
  assistantMessageIds: [createdGlobalChatAssistantMessageId],
  providerId: "anthropic",
  modelId: "claude-sonnet-4-5",
  thinkingLevel: "off",
  draftText: "",
  draftMessages: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};
const createdGlobalChatUserMessage = {
  id: createdGlobalChatUserMessageId,
  role: "user",
  text: "First global prompt",
  sequence: 1,
  createdAt: timestamp,
};
const createdGlobalChatCreateResult = {
  session: createdGlobalChatSession,
  turn: createdGlobalChatTurn,
  userMessage: createdGlobalChatUserMessage,
  firstMessage: createdGlobalChatUserMessage,
};
const errorResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const installGlobalChatDraftFetch = (options: {
  readonly createResponse: (request: Request) => Response;
}) => {
  const requests: DraftRequestDetails[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestFrom(input, init);
      const parsed = new URL(request.url);
      requests.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get("authorization"),
        body:
          request.method === "POST" || request.method === "PUT"
            ? await request
                .clone()
                .json()
                .catch(() => undefined)
            : undefined,
      });
      if (parsed.pathname === "/v1/connection")
        return json({
          instanceId: descriptor.instanceId,
          protocolVersion: descriptor.protocolVersion,
          status: "ready",
        });
      if (parsed.pathname === "/v1/events") return hostConnectedStream();
      if (
        parsed.pathname === "/v1/global-chat-sessions" &&
        request.method === "GET"
      )
        return json({ sessions: [] });
      if (
        parsed.pathname === "/v1/global-chat-sessions" &&
        request.method === "POST"
      )
        return options.createResponse(request);
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${createdGlobalChatSessionId}/messages`
      )
        return json({
          session: createdGlobalChatSession,
          messages: [createdGlobalChatUserMessage],
          activeTurn: createdGlobalChatTurn,
          latestTurn: createdGlobalChatTurn,
        });
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${createdGlobalChatSessionId}/follow-ups`
      )
        return json({ session: createdGlobalChatSession, followUps: [] });
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${createdGlobalChatSessionId}/events`
      )
        // Keep the stream open so the subscription waits instead of hot-reconnecting.
        return new Response(
          new ReadableStream({
            start() {
              // Never closes during the test.
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
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
      const request = requests.find(
        (current) =>
          new URL(current.url).pathname ===
          `/v1/project-sessions/${projectSessionId}/messages`,
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
      const request = requests.find(
        (current) =>
          new URL(current.url).pathname ===
          `/v1/global-chat-sessions/${globalChatSessionId}/messages`,
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

  it("opens the New chat draft from the sidebar without creating a durable session", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const requests = installGlobalChatDraftFetch({ createResponse: json });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    expect(
      await screen.findByRole("heading", { name: "New chat" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "New chat",
    );
    expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();

    // Abandoning the draft by navigating away must not create a session.
    fireEvent.click(screen.getByRole("button", { name: "Agent Capabilities" }));
    expect(
      await screen.findByRole("heading", { name: "Agent Capabilities" }),
    ).toBeInTheDocument();

    const createRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/v1/global-chat-sessions",
    );
    expect(createRequests).toHaveLength(0);
  });

  it("creates the Global Chat Session from the New chat draft on first send", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const requests = installGlobalChatDraftFetch({
      createResponse: () => json(createdGlobalChatCreateResult),
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, {
      target: { value: "First global prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    const createRequest = await waitFor(() => {
      const request = requests.find(
        (candidate) =>
          candidate.method === "POST" &&
          new URL(candidate.url).pathname === "/v1/global-chat-sessions",
      );
      if (!request) throw new Error("create-with-first-prompt request missing");
      return request;
    });
    expect(createRequest.authorization).toBe(
      `Bearer ${descriptor.clientCapability}`,
    );
    expect(createRequest.body).toEqual({
      commandId: expect.any(String),
      firstPrompt: "First global prompt",
    });

    expect(
      await screen.findByRole("heading", { name: createdGlobalChatSessionId }),
    ).toBeInTheDocument();
    expect(await screen.findByText("First global prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Global Chat Session",
    );
  });

  it("surfaces first-prompt creation errors without creating a fake local chat", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const requests = installGlobalChatDraftFetch({
      createResponse: () =>
        errorResponse(
          {
            code: "command_id_conflict",
            message:
              "This Global Chat Session command ID was already used for different input.",
          },
          409,
        ),
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    const composer = await screen.findByRole("textbox", { name: "Message" });
    fireEvent.change(composer, {
      target: { value: "First global prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Global Chat Session command ID was already used for different input.",
    );
    expect(
      screen.getByRole("heading", { name: "New chat" }),
    ).toBeInTheDocument();

    const createRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === "/v1/global-chat-sessions",
    );
    expect(createRequests).toHaveLength(1);
  });

  it("shows up to 10 recent unarchived chats in the sidebar", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const recentChats = Array.from({ length: 12 }, (_, index) => ({
      id: `aaaaaaaa-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Recent chat ${String(index + 1).padStart(2, "0")}`,
      archived: false,
      createdAt: timestamp,
      updatedAt: `2026-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      lastSequence: 1,
    }));
    const archivedChats = [
      {
        id: "bbbbbbbb-0000-4000-8000-000000000001",
        title: "Archived chat A",
        archived: true,
        createdAt: timestamp,
        updatedAt: "2026-02-28T00:00:00.000Z",
        lastSequence: 3,
      },
      {
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        title: "Archived chat B",
        archived: true,
        createdAt: timestamp,
        updatedAt: "2026-02-27T00:00:00.000Z",
        lastSequence: 2,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const parsed = new URL(request.url);
        if (parsed.pathname === "/v1/connection")
          return json({
            instanceId: descriptor.instanceId,
            protocolVersion: descriptor.protocolVersion,
            status: "ready",
          });
        if (parsed.pathname === "/v1/events") return hostConnectedStream();
        if (parsed.pathname === "/v1/global-chat-sessions")
          return json({ sessions: [...archivedChats, ...recentChats] });
        return new Response("not found", { status: 404 });
      }),
    );

    render(<App />);

    expect(
      await screen.findByRole("button", { name: "Recent chat 12" }),
    ).toBeInTheDocument();
    const expectedTitles = Array.from(
      { length: 10 },
      (_, index) => `Recent chat ${String(index + 3).padStart(2, "0")}`,
    );
    for (const title of expectedTitles) {
      expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Recent chat 02" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recent chat 01" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archived chat A" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archived chat B" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Archive" })).toHaveLength(10);
  });

  it("opens All chats from the sidebar action with the Unarchived empty state", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const parsed = new URL(request.url);
        if (parsed.pathname === "/v1/connection")
          return json({
            instanceId: descriptor.instanceId,
            protocolVersion: descriptor.protocolVersion,
            status: "ready",
          });
        if (parsed.pathname === "/v1/events") return hostConnectedStream();
        if (parsed.pathname === "/v1/global-chat-sessions")
          return json({ sessions: [] });
        return new Response("not found", { status: 404 });
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "All chats" }));

    expect(
      await screen.findByRole("heading", { name: "All chats" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "All chats",
    );
    expect(
      screen.getByRole("tab", { name: "Unarchived" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("No chats yet")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Archived" })).toBeInTheDocument();
  });

  it("lists Global Chat Sessions in All chats and opens a session from a row", async () => {
    const getLocalHostConnection = vi.fn().mockResolvedValue(descriptor);
    Object.defineProperty(window, "spacezero", {
      value: { getAppVersion: vi.fn(), getLocalHostConnection },
      configurable: true,
    });
    const archivedChatSessionId = "88888888-8888-4888-8888-888888888888";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init);
        const parsed = new URL(request.url);
        if (parsed.pathname === "/v1/connection")
          return json({
            instanceId: descriptor.instanceId,
            protocolVersion: descriptor.protocolVersion,
            status: "ready",
          });
        if (parsed.pathname === "/v1/events") return hostConnectedStream();
        if (parsed.pathname === "/v1/global-chat-sessions")
          return json({
            sessions: [
              {
                id: globalChatSessionId,
                title: "Global prompt",
                archived: false,
                createdAt: timestamp,
                updatedAt: timestamp,
                lastSequence: 2,
              },
              {
                id: archivedChatSessionId,
                title: "Archived chat",
                archived: true,
                createdAt: timestamp,
                updatedAt: timestamp,
                lastSequence: 1,
              },
            ],
          });
        if (
          parsed.pathname ===
          `/v1/global-chat-sessions/${globalChatSessionId}/messages`
        )
          return json({
            session: {
              id: globalChatSessionId,
              title: "Global prompt",
              archived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSequence: 2,
            },
            messages: [
              {
                id: "66666666-6666-4666-8666-666666666666",
                role: "assistant",
                text: "Global saved answer",
                sequence: 2,
                createdAt: timestamp,
              },
            ],
          });
        if (
          parsed.pathname ===
          `/v1/global-chat-sessions/${globalChatSessionId}/follow-ups`
        )
          return json({
            session: {
              id: globalChatSessionId,
              title: "Global prompt",
              archived: false,
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSequence: 2,
            },
            followUps: [],
          });
        if (
          parsed.pathname ===
          `/v1/global-chat-sessions/${globalChatSessionId}/events`
        )
          return new Response(
            new ReadableStream({
              start() {
                // Never closes during the test.
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        return new Response("not found", { status: 404 });
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "All chats" }));

    const main = screen.getByRole("main", { name: "Workspace" });
    const row = await within(main).findByText("Global prompt");
    expect(within(main).getByText("Global saved answer")).toBeInTheDocument();
    expect(within(main).queryByText("Archived chat")).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(
      await screen.findByRole("heading", { name: globalChatSessionId }),
    ).toBeInTheDocument();
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
