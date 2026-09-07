import { describe, expect, it } from "vitest";

import {
  ALL_CHATS_ROUTE_MARKER,
  chatRouteStateForPathname,
  persistedRouteMarker,
  restoreTargetForMarker,
} from "./chat-route-restoration.js";

describe("chatRouteStateForPathname", () => {
  it("recognizes an active Global Chat Session route", () => {
    expect(chatRouteStateForPathname("/global-chat-sessions/abc-123")).toEqual({
      kind: "session",
      sessionId: "abc-123",
    });
  });

  it("recognizes a Global Chat Session route with an encoded session id", () => {
    expect(
      chatRouteStateForPathname("/global-chat-sessions/abc%2Fdef"),
    ).toEqual({ kind: "session", sessionId: "abc/def" });
  });

  it("treats the All Chats screen as the selected All Chats state", () => {
    expect(chatRouteStateForPathname("/global-chat-sessions")).toEqual({
      kind: "all",
    });
    expect(chatRouteStateForPathname("/global-chat-sessions/")).toEqual({
      kind: "all",
    });
  });

  it("treats the New chat draft route as All Chats (drafts are not durable)", () => {
    expect(chatRouteStateForPathname("/global-chat-sessions/new")).toEqual({
      kind: "all",
    });
  });

  it("treats non-Global-Chat routes as no Global Chat state", () => {
    expect(chatRouteStateForPathname("/")).toBeNull();
    expect(chatRouteStateForPathname("/settings")).toBeNull();
    expect(chatRouteStateForPathname("/agent-capabilities")).toBeNull();
    expect(chatRouteStateForPathname("/project-sessions/abc")).toBeNull();
  });
});

describe("persistedRouteMarker", () => {
  it("persists only the session id for an active session route", () => {
    expect(
      persistedRouteMarker({
        kind: "session",
        sessionId: "abc-123",
      }),
    ).toBe("abc-123");
  });

  it("persists the All Chats marker when no session is selected", () => {
    expect(persistedRouteMarker({ kind: "all" })).toBe(
      ALL_CHATS_ROUTE_MARKER,
    );
  });

  it("clears the marker outside of Global Chat", () => {
    expect(persistedRouteMarker(null)).toBeNull();
  });
});

describe("restoreTargetForMarker", () => {
  it("restores the persisted session route when the session is available", () => {
    expect(
      restoreTargetForMarker("abc-123", { sessionAvailable: true }),
    ).toEqual({
      to: "/global-chat-sessions/$sessionId",
      params: { sessionId: "abc-123" },
    });
  });

  it("falls back to All Chats when the persisted session is unavailable", () => {
    expect(
      restoreTargetForMarker("abc-123", { sessionAvailable: false }),
    ).toEqual({ to: "/global-chat-sessions" });
  });

  it("restores All Chats when no session was selected", () => {
    expect(
      restoreTargetForMarker(ALL_CHATS_ROUTE_MARKER, {
        sessionAvailable: false,
      }),
    ).toEqual({ to: "/global-chat-sessions" });
  });

  it("does not restore anything when Global Chat was not active", () => {
    expect(
      restoreTargetForMarker(null, { sessionAvailable: true }),
    ).toBeNull();
  });
});
