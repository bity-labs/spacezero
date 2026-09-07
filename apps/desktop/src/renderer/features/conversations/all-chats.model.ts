import {
  GLOBAL_CHAT_SESSIONS_PAGE_SIZE,
  type ListGlobalChatSessionsResult,
  type GlobalChatSessionSummary,
} from "@spacezero/host-contracts";

export type AllChatsTabId = "unarchived" | "archived";

/** All Chats loads Global Chat Sessions 20 per page (PRD #516, issue #586). */
export const ALL_CHATS_PAGE_SIZE = GLOBAL_CHAT_SESSIONS_PAGE_SIZE;

export const ALL_CHATS_TABS: readonly { readonly id: AllChatsTabId }[] = [
  { id: "unarchived" },
  { id: "archived" },
];

/** Accumulated pagination state for one All Chats tab. */
export interface AllChatsTabPage {
  readonly sessions: readonly GlobalChatSessionSummary[];
  /** Offset for the next page; absent once no more pages remain. */
  readonly nextOffset?: number;
}

export const emptyAllChatsTabPage: AllChatsTabPage = { sessions: [] };

/**
 * Appends one batched Host page to a tab's accumulated pagination state.
 * Sessions arrive Host-ordered per tab semantics; duplicates are dropped so
 * overlapping pages stay stable, and continuation stops on the last page.
 */
export function appendChatSessionPage(
  state: AllChatsTabPage,
  page: ListGlobalChatSessionsResult,
): AllChatsTabPage {
  const known = new Set(state.sessions.map((session) => session.id));
  return {
    sessions: [
      ...state.sessions,
      ...page.sessions.filter((session) => !known.has(session.id)),
    ],
    ...(page.pageInfo?.hasMore === true &&
    page.pageInfo.nextOffset !== undefined
      ? { nextOffset: page.pageInfo.nextOffset }
      : {}),
  };
}

const byUpdatedAtDescending = (
  a: GlobalChatSessionSummary,
  b: GlobalChatSessionSummary,
): number => b.updatedAt.localeCompare(a.updatedAt);

/**
 * Selects the sessions shown in the All Chats Unarchived tab: archived
 * sessions are hidden and sessions sort by last updated descending.
 */
export function selectUnarchivedSessions(
  sessions: readonly GlobalChatSessionSummary[],
): readonly GlobalChatSessionSummary[] {
  return sessions
    .filter((session) => !session.archived)
    .sort(byUpdatedAtDescending);
}

/**
 * Selects the sessions shown in the All Chats Archived tab: sessions sort by
 * archived time descending, while rows still display last-updated time only.
 */
export function selectArchivedSessions(
  sessions: readonly GlobalChatSessionSummary[],
): readonly GlobalChatSessionSummary[] {
  return sessions
    .filter((session) => session.archived)
    .sort((a, b) => {
      const aArchivedAt = a.archivedAt ?? "";
      const bArchivedAt = b.archivedAt ?? "";
      if (aArchivedAt !== bArchivedAt)
        return bArchivedAt.localeCompare(aArchivedAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

const relativeUnits: readonly {
  readonly unit: Intl.RelativeTimeFormatUnit;
  readonly millis: number;
}[] = [
  { unit: "day", millis: 86_400_000 },
  { unit: "hour", millis: 3_600_000 },
  { unit: "minute", millis: 60_000 },
];

/**
 * Formats the last-updated label for All Chats rows: a relative label for
 * recent updates and a date label for older sessions.
 */
export function formatChatUpdatedAt(
  updatedAt: string,
  now: Date = new Date(),
  locale?: Intl.LocalesArgument,
): string {
  const diffMillis = new Date(updatedAt).getTime() - now.getTime();
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });
  for (const { unit, millis } of relativeUnits) {
    const value = Math.trunc(diffMillis / millis);
    if (unit === "day" && Math.abs(value) > 30) break;
    if (value !== 0) return formatter.format(value, unit);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(updatedAt),
  );
}
