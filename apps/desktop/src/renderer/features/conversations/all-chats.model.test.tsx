import type {
  GlobalChatSessionMessage,
  GlobalChatSessionSummary,
} from "@spacezero/host-contracts";
import { describe, expect, it } from "vitest";

import {
  ALL_CHATS_TABS,
  deriveLastMessagePreview,
  formatChatUpdatedAt,
  loadAllChatPreviews,
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

const message = (
  overrides: Partial<GlobalChatSessionMessage> & {
    id: string;
    role: GlobalChatSessionMessage["role"];
  },
): GlobalChatSessionMessage => ({
  text: "",
  sequence: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("ALL_CHATS_TABS", () => {
  it("exposes the Unarchived and Archived tabs", () => {
    expect(ALL_CHATS_TABS.map((tab) => tab.id)).toEqual([
      "unarchived",
      "archived",
    ]);
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
  it("returns only archived sessions sorted by last updated descending", () => {
    const sessions = [
      summary({
        id: "older-archived",
        archived: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
      summary({ id: "active" }),
      summary({
        id: "newer-archived",
        archived: true,
        updatedAt: "2026-01-05T00:00:00.000Z",
      }),
    ];

    expect(
      selectArchivedSessions(sessions).map((session) => session.id),
    ).toEqual(["newer-archived", "older-archived"]);
  });

  it("returns an empty list when nothing is archived", () => {
    expect(selectArchivedSessions([summary({ id: "s-1" })])).toEqual([]);
  });
});

describe("deriveLastMessagePreview", () => {
  it("uses the most recent user or assistant message text", () => {
    expect(
      deriveLastMessagePreview(
        message({
          id: "m-1",
          role: "assistant",
          text: "Here is a draft outline for the release notes.",
        }),
      ),
    ).toBe("Here is a draft outline for the release notes.");
  });

  it("renders the first non-empty line of a multi-line message", () => {
    expect(
      deriveLastMessagePreview(
        message({
          id: "m-2",
          role: "user",
          text: "Plan the release notes\nfor beta 17",
        }),
      ),
    ).toBe("Plan the release notes");
  });

  it("falls back to the first text part when the message text is empty", () => {
    expect(
      deriveLastMessagePreview({
        id: "m-3",
        role: "assistant",
        text: "",
        sequence: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        parts: [
          { id: "p-1", type: "reasoning", order: 1, text: "thinking" },
          { id: "p-2", type: "text", order: 2, text: "The answer is 42." },
        ],
      }),
    ).toBe("The answer is 42.");
  });

  it("returns an empty preview without a message", () => {
    expect(deriveLastMessagePreview(undefined)).toBe("");
  });
});

describe("loadAllChatPreviews", () => {
  it("reads the newest message per session through the messages endpoint", async () => {
    const fetched: string[] = [];
    const previews = await loadAllChatPreviews(
      [summary({ id: "s-1" }), summary({ id: "s-2" })],
      async (sessionId) => {
        fetched.push(sessionId);
        return sessionId === "s-1"
          ? message({ id: "m-1", role: "user", text: "First prompt" })
          : message({
              id: "m-2",
              role: "assistant",
              text: "Assistant reply",
            });
      },
    );

    expect(fetched.sort()).toEqual(["s-1", "s-2"]);
    expect(previews.get("s-1")).toBe("First prompt");
    expect(previews.get("s-2")).toBe("Assistant reply");
  });

  it("omits sessions without a readable last message and tolerates failures", async () => {
    const previews = await loadAllChatPreviews(
      [
        summary({ id: "s-empty" }),
        summary({ id: "s-failing" }),
        summary({ id: "s-blank" }),
      ],
      async (sessionId) => {
        if (sessionId === "s-failing") throw new Error("host unavailable");
        if (sessionId === "s-blank")
          return message({ id: "m-blank", role: "user", text: "   \n  " });
        return undefined;
      },
    );

    expect(previews.size).toBe(0);
  });
});

describe("formatChatUpdatedAt", () => {
  const now = new Date("2026-01-01T12:00:00.000Z");

  it("formats recent updates as relative time", () => {
    expect(
      formatChatUpdatedAt(
        "2026-01-01T11:58:00.000Z",
        now,
        "en",
      ),
    ).toBe("2 minutes ago");
    expect(
      formatChatUpdatedAt(
        "2026-01-01T11:00:00.000Z",
        now,
        "en",
      ),
    ).toBe("1 hour ago");
  });

  it("formats older updates with a date label", () => {
    expect(
      formatChatUpdatedAt(
        "2025-10-01T00:00:00.000Z",
        now,
        "en-US",
      ),
    ).toBe("Oct 1, 2025");
  });
});
