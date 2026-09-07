import type { ListGlobalChatSessionsResult } from "@spacezero/host-contracts";
import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import { describe, expect, it } from "vitest";

import {
  ALL_CHATS_TABS,
  ALL_CHATS_PAGE_SIZE,
  appendChatSessionPage,
  emptyAllChatsTabPage,
  formatChatUpdatedAt,
  selectArchivedSessions,
  selectUnarchivedSessions,
} from "./all-chats.model.js";

const summary = (
  overrides: Partial<GlobalChatSessionSummary> & { id: string },
): GlobalChatSessionSummary => ({
  title: `Chat ${overrides.id}`,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastSequence: 1,
  ...overrides,
});

const page = (
  sessions: readonly GlobalChatSessionSummary[],
  pageInfo?: ListGlobalChatSessionsResult["pageInfo"],
): ListGlobalChatSessionsResult => ({
  sessions,
  ...(pageInfo === undefined ? {} : { pageInfo }),
});

describe("ALL_CHATS_TABS", () => {
  it("exposes the Unarchived and Archived tabs", () => {
    expect(ALL_CHATS_TABS.map((tab) => tab.id)).toEqual([
      "unarchived",
      "archived",
    ]);
  });
});

describe("ALL_CHATS_PAGE_SIZE", () => {
  it("matches the required 20-per-page page size", () => {
    expect(ALL_CHATS_PAGE_SIZE).toBe(20);
  });
});

describe("selectUnarchivedSessions", () => {
  it("hides archived sessions and sorts by last updated descending", () => {
    const sessions = [
      summary({ id: "old-active", updatedAt: "2026-01-02T00:00:00.000Z" }),
      summary({ id: "archived", archived: true }),
      summary({ id: "newest", updatedAt: "2026-01-04T00:00:00.000Z" }),
      summary({ id: "middle", updatedAt: "2026-01-03T00:00:00.000Z" }),
    ];

    expect(
      selectUnarchivedSessions(sessions).map((session) => session.id),
    ).toEqual(["newest", "middle", "old-active"]);
  });

  it("returns an empty list when every session is archived", () => {
    expect(
      selectUnarchivedSessions([summary({ id: "s-1", archived: true })]),
    ).toEqual([]);
  });
});

describe("selectArchivedSessions", () => {
  it("returns only archived sessions sorted by archived time descending", () => {
    const sessions = [
      summary({
        id: "older-archived",
        archived: true,
        updatedAt: "2026-01-05T00:00:00.000Z",
        archivedAt: "2026-01-02T00:00:00.000Z",
      }),
      summary({ id: "active" }),
      summary({
        id: "newer-archived",
        archived: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: "2026-01-06T00:00:00.000Z",
      }),
    ];

    expect(
      selectArchivedSessions(sessions).map((session) => session.id),
    ).toEqual(["newer-archived", "older-archived"]);
  });

  it("keeps archived-time ties ordered by last updated descending", () => {
    const sessions = [
      summary({
        id: "tie-older",
        archived: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
        archivedAt: "2026-01-06T00:00:00.000Z",
      }),
      summary({
        id: "tie-newer",
        archived: true,
        updatedAt: "2026-01-05T00:00:00.000Z",
        archivedAt: "2026-01-06T00:00:00.000Z",
      }),
    ];

    expect(
      selectArchivedSessions(sessions).map((session) => session.id),
    ).toEqual(["tie-newer", "tie-older"]);
  });

  it("returns an empty list when nothing is archived", () => {
    expect(selectArchivedSessions([summary({ id: "s-1" })])).toEqual([]);
  });
});

describe("appendChatSessionPage", () => {
  it("appends a batched page's sessions and continuation state", () => {
    const firstPage = page(
      [
        summary({ id: "s-1", lastMessagePreview: "First preview" }),
        summary({ id: "s-2", lastMessagePreview: "Second preview" }),
      ],
      { pageSize: 20, hasMore: true, nextOffset: 20 },
    );

    const state = appendChatSessionPage(emptyAllChatsTabPage, firstPage);

    expect(state.sessions.map((session) => session.id)).toEqual(["s-1", "s-2"]);
    expect(state.nextOffset).toBe(20);
  });

  it("stops continuation once a final page arrives", () => {
    const started = appendChatSessionPage(
      emptyAllChatsTabPage,
      page([summary({ id: "s-1" })], {
        pageSize: 20,
        hasMore: true,
        nextOffset: 20,
      }),
    );
    const finalPage = page(
      [summary({ id: "s-2", lastMessagePreview: "Later preview" })],
      { pageSize: 5, hasMore: false },
    );

    const state = appendChatSessionPage(started, finalPage);

    expect(state.sessions.map((session) => session.id)).toEqual(["s-1", "s-2"]);
    expect(state.nextOffset).toBeUndefined();
  });

  it("keeps accumulated sessions ordered by host page order without duplicates", () => {
    const firstPage = page([summary({ id: "s-1" }), summary({ id: "s-2" })], {
      pageSize: 20,
      hasMore: true,
      nextOffset: 20,
    });

    const state = appendChatSessionPage(
      appendChatSessionPage(emptyAllChatsTabPage, firstPage),
      page([summary({ id: "s-2" }), summary({ id: "s-3" })], {
        pageSize: 20,
        hasMore: false,
      }),
    );

    expect(state.sessions.map((session) => session.id)).toEqual([
      "s-1",
      "s-2",
      "s-3",
    ]);
  });
});

describe("formatChatUpdatedAt", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("formats recent updates as relative time", () => {
    expect(formatChatUpdatedAt("2026-01-01T11:58:00.000Z", now, "en")).toBe(
      "2 minutes ago",
    );
    expect(formatChatUpdatedAt("2026-01-01T11:00:00.000Z", now, "en")).toBe(
      "1 hour ago",
    );
  });

  it("formats older updates with a date label", () => {
    expect(formatChatUpdatedAt("2025-10-01T00:00:00.000Z", now, "en-US")).toBe(
      "Oct 1, 2025",
    );
  });
});
