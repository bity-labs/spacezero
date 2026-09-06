import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";

export const RECENT_CHATS_LIMIT = 10;

/**
 * Selects the recent unarchived Global Chat Sessions shown in the App Sidebar
 * Chats section: archived sessions are hidden, sessions sort by last updated
 * descending, and only the most recent 10 sessions are kept.
 */
export function selectRecentUnarchivedChats(
  sessions: readonly GlobalChatSessionSummary[],
  limit: number = RECENT_CHATS_LIMIT,
): readonly GlobalChatSessionSummary[] {
  return sessions
    .filter((session) => !session.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
