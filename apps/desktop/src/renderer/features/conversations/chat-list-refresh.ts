type ChatListRefreshListener = () => void;

const listeners = new Set<ChatListRefreshListener>();

/**
 * Notifies App Sidebar recent chats and All Chats that Global Chat Session
 * archive state moved, so Host-backed lists can re-read their projections.
 */
export function refreshChatLists(): void {
  for (const listener of listeners) listener();
}

export function subscribeChatListRefresh(
  listener: ChatListRefreshListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
