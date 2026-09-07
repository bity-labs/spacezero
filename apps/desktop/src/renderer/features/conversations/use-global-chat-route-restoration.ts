import { createGlobalChatSessionClient } from "@spacezero/client-runtime";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import {
  ALL_CHATS_ROUTE_MARKER,
  chatRouteStateForPathname,
  persistedRouteMarker,
  restoreTargetForMarker,
  type RestoreTarget,
} from "./chat-route-restoration.js";

export interface LastActiveGlobalChatSessionStorage {
  readonly get: () => Promise<string | null>;
  readonly set: (sessionId: string | null) => Promise<void>;
}

/**
 * Renderer-safe storage for the last active Global Chat route marker. The
 * marker is a bare Global Chat Session id, the All Chats marker, or null:
 * never Host credentials, client capabilities, Pi state, transcripts, or
 * other secrets.
 */
export const lastActiveGlobalChatSessionStorage =
  (): LastActiveGlobalChatSessionStorage | undefined => {
    const api = window.spacezero?.lastActiveGlobalChatSession;
    return api ? { get: api.get.bind(api), set: api.set.bind(api) } : undefined;
  };

/**
 * Confirms Global Chat Session availability through a Host-owned projection
 * query. Unreachable Host, missing session, or any other failure means the
 * session is unavailable and restoration falls back to All Chats.
 */
export const isGlobalChatSessionAvailable = async (
  sessionId: string,
): Promise<boolean> => {
  try {
    const client = createGlobalChatSessionClient({
      getConnectionDescriptor: window.spacezero.getLocalHostConnection,
    });
    await client.listMessages(sessionId);
    return true;
  } catch {
    return false;
  }
};

/**
 * Restores the last active Global Chat route on application start and keeps
 * the persisted marker in sync with the active route while the app runs:
 * an active session route persists its session id, the All Chats and New Chat
 * draft routes persist the All Chats marker, and any non-Global-Chat route
 * clears the marker.
 *
 * The initial marker read completes before the first marker write so the
 * restoration decision cannot race with clearing the marker.
 */
export const useGlobalChatRouteRestoration = (): void => {
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const restoreRef = useRef<Promise<void> | null>(null);
  const storageRef = useRef<LastActiveGlobalChatSessionStorage | undefined>(
    undefined,
  );

  const startRestoration = useCallback((): Promise<void> => {
    if (restoreRef.current) return restoreRef.current;
    restoreRef.current = (async () => {
      const storage = lastActiveGlobalChatSessionStorage();
      storageRef.current = storage;
      if (!storage) return;
      const marker = await storage.get().catch(() => null);
      if (marker === null) return;
      const sessionAvailable =
        marker === ALL_CHATS_ROUTE_MARKER
          ? true
          : await isGlobalChatSessionAvailable(marker);
      const target: RestoreTarget = restoreTargetForMarker(marker, {
        sessionAvailable,
      });
      if (target === null) return;
      // Only restore while the app is still on its initial landing route;
      // never yank the user away from a route they already chose.
      if (router.state.location.pathname !== "/") return;
      await router.navigate(target);
    })();
    return restoreRef.current;
  }, [router]);

  useEffect(() => {
    void startRestoration().then(() => {
      const storage = storageRef.current;
      if (!storage) return;
      return storage
        .set(persistedRouteMarker(chatRouteStateForPathname(pathname)))
        .catch(() => undefined);
    });
  }, [pathname, startRestoration]);
};
