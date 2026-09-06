import type {
  GlobalChatSessionMessage,
  GlobalChatSessionSummary,
} from "@spacezero/host-contracts";

export type AllChatsTabId = "unarchived" | "archived";

export const ALL_CHATS_TABS: readonly { readonly id: AllChatsTabId }[] = [
  { id: "unarchived" },
  { id: "archived" },
];

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
 * Selects the sessions shown in the All Chats Archived tab. Full archive
 * management is handled by the archive/unarchive slice; until Host summaries
 * expose archived time, sessions sort by last updated descending.
 */
export function selectArchivedSessions(
  sessions: readonly GlobalChatSessionSummary[],
): readonly GlobalChatSessionSummary[] {
  return sessions
    .filter((session) => session.archived)
    .sort(byUpdatedAtDescending);
}

/**
 * Derives the last-message preview from a session message: the most recent
 * message from either user or assistant, rendered as its first non-empty
 * line.
 */
export function deriveLastMessagePreview(
  message: GlobalChatSessionMessage | undefined,
): string {
  if (!message) return "";
  const firstNonEmptyLine = (text: string): string => {
    const line = text
      .split(/\r\n|\n|\r/u)
      .map((value) => value.trim())
      .find((value) => value.length > 0);
    return line ?? "";
  };
  const fromText = firstNonEmptyLine(message.text);
  if (fromText.length > 0) return fromText;
  const partText = (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ");
  return firstNonEmptyLine(partText);
}

/**
 * Loads the last-message preview for each session by reading the newest
 * message (`limit: 1`) of every session through the existing per-session
 * messages endpoint. Returns a map of session id to preview; sessions without
 * a readable last message have no entry.
 */
export async function loadAllChatPreviews(
  sessions: readonly GlobalChatSessionSummary[],
  listLastMessage: (
    sessionId: string,
  ) => Promise<GlobalChatSessionMessage | undefined>,
): Promise<ReadonlyMap<string, string>> {
  const entries = await Promise.all(
    sessions.map(async (session) => {
      try {
        const message = await listLastMessage(session.id);
        const preview = deriveLastMessagePreview(message);
        return preview.length > 0
          ? ([session.id, preview] as const)
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return new Map(entries.filter((entry) => entry !== undefined));
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
