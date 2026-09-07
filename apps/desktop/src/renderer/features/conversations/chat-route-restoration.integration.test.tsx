import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { HostConnectionDescriptor } from "@spacezero/host-contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app.js";
import { router } from "../../router.js";

const timestamp = "2026-01-01T00:00:00.000Z";
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
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

const savedSession = {
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
      role: "user",
      text: "Global saved question",
      sequence: 1,
      createdAt: timestamp,
    },
  ],
};

const requestFrom = (input: RequestInfo | URL, init?: RequestInit): Request =>
  input instanceof Request ? input : new Request(input, init);

type StorageCalls = {
  get: number;
  set: (readonly [string | null])[];
};

const installApp = (options: {
  readonly persistedMarker: string | null;
  readonly hostAvailable?: boolean;
  readonly sessionAvailable?: boolean;
}) => {
  const storage: StorageCalls = { get: 0, set: [] };
  let storedMarker = options.persistedMarker;
  const hostAvailable = options.hostAvailable ?? true;
  const sessionAvailable = options.sessionAvailable ?? true;
  const getLocalHostConnection = hostAvailable
    ? vi.fn().mockResolvedValue(descriptor)
    : vi.fn().mockRejectedValue(new Error("host unavailable"));

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
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${globalChatSessionId}/messages`
      ) {
        return sessionAvailable
          ? json(savedSession)
          : json({ code: "session_not_found", message: "missing" }, 404);
      }
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${globalChatSessionId}/follow-ups`
      )
        return json({
          session: savedSession.session,
          followUps: [],
        });
      if (
        parsed.pathname ===
        `/v1/global-chat-sessions/${globalChatSessionId}/events`
      )
        return hostConnectedStream();
      if (parsed.pathname === "/v1/global-chat-sessions")
        return json({
          sessions: sessionAvailable
            ? [savedSession.session]
            : [],
        });
      return new Response("not found", { status: 404 });
    }),
  );

  Object.defineProperty(window, "spacezero", {
    value: {
      getAppVersion: vi.fn(),
      getLocalHostConnection,
      lastActiveGlobalChatSession: {
        get: vi.fn(() => {
          storage.get += 1;
          return Promise.resolve(storedMarker);
        }),
        set: vi.fn((sessionId: string | null) => {
          storage.set.push([sessionId] as const);
          storedMarker = sessionId;
          return Promise.resolve();
        }),
      },
    },
    configurable: true,
  });

  return { storage, getLocalHostConnection };
};

describe("Global Chat route restoration", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    // Reset the module-level hash router to the landing route like a fresh
    // application start. The queued navigation completes once this test's
    // RouterProvider mounts; raw window.location assignments are avoided so
    // no late hashchange can overwrite a restored route mid-test.
    void router.navigate({ to: "/" });
  });

  it("restores the last active Global Chat Session route after restart", async () => {
    const { storage } = installApp({ persistedMarker: globalChatSessionId });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Global prompt" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Global Chat Session",
    );
    expect(storage.get).toBeGreaterThanOrEqual(1);
    expect(storage.set.at(-1)).toEqual([globalChatSessionId]);
  });

  it("falls back to All Chats when the persisted session is unavailable", async () => {
    const { storage } = installApp({
      persistedMarker: globalChatSessionId,
      sessionAvailable: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
        "All chats",
      );
    });
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "All chats",
    );
    expect(
      await screen.findByText("No chats yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Global prompt" }),
    ).not.toBeInTheDocument();
    expect(storage.set.at(-1)).toEqual(["all-chats"]);
  });

  it("falls back to All Chats when the Host is unreachable", async () => {
    installApp({
      persistedMarker: globalChatSessionId,
      hostAvailable: false,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
        "All chats",
      );
    });
  });

  it("restores All Chats when Global Chat was active without a selected session", async () => {
    installApp({ persistedMarker: "all-chats" });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
        "All chats",
      );
    });
  });

  it("does not restore any chat route when no Global Chat Session was selected", async () => {
    installApp({ persistedMarker: null });

    render(<App />);

    expect(
      await screen.findByText("Welcome to Space Zero"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Window title bar")).toHaveTextContent(
      "Workspace",
    );
  });

  it("persists only a minimal non-secret route marker while navigating", async () => {
    const { storage } = installApp({ persistedMarker: null });

    render(<App />);

    // Open the persisted-session chat through the sidebar recent list.
    const chatRow = await screen.findByRole("button", {
      name: "Global prompt",
    });
    chatRow.click();

    await waitFor(() => {
      expect(storage.set.at(-1)).toEqual([globalChatSessionId]);
    });

    // Leave Global Chat: the marker clears so a restart does not restore it.
    (
      await screen.findByRole("button", { name: "Agent Capabilities" })
    ).click();

    await waitFor(() => {
      expect(storage.set.at(-1)).toEqual([null]);
    });

    // Every persisted value is a bare session id, the All Chats marker, or
    // null: never credentials, capabilities, transcripts, or other secrets.
    expect(storage.set.length).toBeGreaterThan(0);
    for (const [value] of storage.set) {
      if (value === null) continue;
      expect(value === "all-chats" || value === globalChatSessionId).toBe(
        true,
      );
      expect(value.includes(descriptor.clientCapability)).toBe(false);
    }
  });
});
