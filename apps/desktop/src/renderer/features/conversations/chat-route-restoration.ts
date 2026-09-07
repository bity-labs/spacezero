import type { NavigateOptions } from "@tanstack/react-router";

/**
 * Renderer-owned Global Chat route restoration model.
 *
 * Route restoration is client UI state only: the persisted marker is a single
 * non-secret string (a Global Chat Session id, the All Chats marker, or null).
 * Session availability is always confirmed through Host-owned projections.
 */

export const ALL_CHATS_ROUTE_MARKER = "all-chats";

export type GlobalChatRouteState =
  | { readonly kind: "all" }
  | { readonly kind: "session"; readonly sessionId: string }
  | null;

/**
 * Persisted marker: a Global Chat Session id, `ALL_CHATS_ROUTE_MARKER` when
 * Global Chat was active without a selected Session, or null when Global Chat
 * was not active.
 */
export type GlobalChatRouteMarker = string | null;

export const isGlobalChatSessionPathname = (pathname: string): boolean =>
  pathname.startsWith("/global-chat-sessions/") &&
  pathname !== "/global-chat-sessions/new" &&
  pathname !== "/global-chat-sessions/";

export const chatRouteStateForPathname = (
  pathname: string,
): GlobalChatRouteState => {
  if (isGlobalChatSessionPathname(pathname)) {
    return {
      kind: "session",
      sessionId: decodeURIComponent(pathname.split("/")[2] ?? ""),
    };
  }
  if (pathname === "/global-chat-sessions" || pathname === "/global-chat-sessions/") {
    return { kind: "all" };
  }
  // The New chat draft is not durable: it restores as All Chats.
  if (pathname === "/global-chat-sessions/new") {
    return { kind: "all" };
  }
  return null;
};

export const persistedRouteMarker = (
  state: GlobalChatRouteState,
): GlobalChatRouteMarker => {
  if (state === null) return null;
  return state.kind === "session" ? state.sessionId : ALL_CHATS_ROUTE_MARKER;
};

export type RestoreTarget = NavigateOptions | null;

/**
 * Resolves the route to restore for a persisted marker. A session marker only
 * restores when the Session is still available (confirmed through the Host);
 * otherwise it falls back to All Chats. No marker means nothing to restore.
 */
export const restoreTargetForMarker = (
  marker: GlobalChatRouteMarker,
  availability: { readonly sessionAvailable: boolean },
): RestoreTarget => {
  if (marker === null) return null;
  if (
    marker !== ALL_CHATS_ROUTE_MARKER &&
    availability.sessionAvailable
  ) {
    return {
      to: "/global-chat-sessions/$sessionId",
      params: { sessionId: marker },
    };
  }
  return { to: "/global-chat-sessions" };
};
