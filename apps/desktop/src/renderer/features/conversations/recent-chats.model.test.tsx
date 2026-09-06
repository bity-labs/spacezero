import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import { describe, expect, it } from "vitest";

import {
  RECENT_CHATS_LIMIT,
  selectRecentUnarchivedChats,
} from "./recent-chats.model.js";

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

describe("selectRecentUnarchivedChats", () => {
  it("hides archived Global Chat Sessions", () => {
    const sessions = [
      summary({ id: "s-archived", archived: true }),
      summary({ id: "s-active" }),
    ];

    const result = selectRecentUnarchivedChats(sessions);

    expect(result.map((session) => session.id)).toEqual(["s-active"]);
  });

  it("sorts recent chats by last updated descending", () => {
    const sessions = [
      summary({ id: "older", updatedAt: "2026-01-01T00:00:00.000Z" }),
      summary({ id: "newest", updatedAt: "2026-01-03T00:00:00.000Z" }),
      summary({ id: "middle", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    const result = selectRecentUnarchivedChats(sessions);

    expect(result.map((session) => session.id)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
  });

  it("limits recent chats to the 10 most recently updated", () => {
    const sessions = Array.from({ length: 12 }, (_, index) =>
      summary({
        id: `s-${index}`,
        updatedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );

    const result = selectRecentUnarchivedChats(sessions);

    expect(result).toHaveLength(RECENT_CHATS_LIMIT);
    expect(RECENT_CHATS_LIMIT).toBe(10);
    expect(result.map((session) => session.id)).toEqual([
      "s-11",
      "s-10",
      "s-9",
      "s-8",
      "s-7",
      "s-6",
      "s-5",
      "s-4",
      "s-3",
      "s-2",
    ]);
  });

  it("returns an empty list without chats", () => {
    expect(selectRecentUnarchivedChats([])).toEqual([]);
  });
});
