import type { GlobalChatSessionClient } from "@spacezero/client-runtime";
import type {
  ListGlobalChatSessionsResult,
  GlobalChatSessionSummary,
} from "@spacezero/host-contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n/index.js";

import { AllChatsScreen } from "./all-chats-screen.js";

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

const archivedOrder = (
  a: GlobalChatSessionSummary,
  b: GlobalChatSessionSummary,
): number => {
  const aArchivedAt = a.archivedAt ?? "";
  const bArchivedAt = b.archivedAt ?? "";
  if (aArchivedAt !== bArchivedAt)
    return bArchivedAt.localeCompare(aArchivedAt);
  return b.updatedAt.localeCompare(a.updatedAt);
};

interface FakeClientOptions {
  sessions: readonly GlobalChatSessionSummary[];
}

/**
 * Fake client that pages like the Host: batched summaries with previews,
 * 20 sessions per page, filtered and ordered per tab semantics.
 */
const fakeClient = ({
  sessions: provided,
}: FakeClientOptions): GlobalChatSessionClient => {
  const sessions = provided.map((session) => ({ ...session }));
  const pageFor = (
    archived: boolean,
    offset: number,
  ): ListGlobalChatSessionsResult => {
    const filtered = sessions
      .filter((session) => session.archived === archived)
      .sort((a, b) =>
        archived ? archivedOrder(a, b) : b.updatedAt.localeCompare(a.updatedAt),
      );
    const slice = filtered.slice(offset, offset + 20);
    const hasMore = filtered.length > offset + slice.length + 0;
    return {
      sessions: slice,
      pageInfo: {
        pageSize: slice.length,
        hasMore,
        ...(hasMore ? { nextOffset: offset + slice.length } : {}),
      },
    };
  };
  return {
    listGlobalChatSessionsPage: vi.fn(
      async ({
        archived = false,
        offset = 0,
      }: {
        archived?: boolean;
        offset?: number;
      }) => pageFor(archived, offset),
    ),
    archiveSession: vi.fn(async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (session) {
        session.archived = true;
        session.archivedAt = "2026-01-03T00:00:00.000Z";
      }
      return { session: structuredClone(session) };
    }),
    unarchiveSession: vi.fn(async (sessionId: string) => {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      if (session) {
        session.archived = false;
        delete session.archivedAt;
      }
      return { session: structuredClone(session) };
    }),
  } as unknown as GlobalChatSessionClient;
};

const pendingClient = (): GlobalChatSessionClient =>
  ({
    listGlobalChatSessionsPage: () => new Promise(() => undefined),
  }) as unknown as GlobalChatSessionClient;

const rejectingClient = (): GlobalChatSessionClient =>
  ({
    listGlobalChatSessionsPage: () => Promise.reject(new Error("down")),
  }) as unknown as GlobalChatSessionClient;

const renderScreen = (
  client: GlobalChatSessionClient,
  handlers: {
    onNewChat?: () => void;
    onSelectSession?: (sessionId: string) => void;
  } = {},
): void => {
  render(
    <AllChatsScreen
      client={client}
      onNewChat={handlers.onNewChat ?? (() => undefined)}
      onSelectSession={handlers.onSelectSession ?? (() => undefined)}
    />,
  );
};

const tab = (label: string): HTMLElement =>
  screen.getByRole("tab", { name: label });

const rowsFor = (...titles: readonly string[]): HTMLElement[] =>
  screen
    .getAllByRole("button")
    .filter((button) =>
      titles.some((title) => button.textContent?.includes(title)),
    );

describe("AllChatsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a loading status before the batched pages resolve", () => {
    renderScreen(pendingClient());

    expect(screen.getByRole("status")).toHaveTextContent("Loading chats");
  });

  it("fetches an initial page of 20 for both tabs without per-session message calls", async () => {
    const sessions = Array.from({ length: 25 }, (_, index) =>
      summary({
        id: `s-${index}`,
        title: `Chat ${index}`,
        updatedAt: `2026-01-01T00:${String(24 - index).padStart(2, "0")}:00.000Z`,
        lastMessagePreview: `Preview ${index}`,
      }),
    );
    const client = fakeClient({ sessions });
    renderScreen(client);

    await screen.findByText("Chat 0");
    const paged = (
      client.listGlobalChatSessionsPage as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0]);
    expect(paged).toEqual([
      { archived: false, limit: 20, offset: 0 },
      { archived: true, limit: 20, offset: 0 },
    ]);
    // Exactly the first 20 unarchived sessions render on the initial page.
    for (let index = 0; index < 20; index++)
      expect(screen.getByText(`Chat ${index}`)).toBeInTheDocument();
    expect(screen.queryByText("Chat 20")).not.toBeInTheDocument();
    expect(client.listMessages).toBeUndefined();
  });

  it("fetches subsequent pages through a load-more affordance", async () => {
    const sessions = Array.from({ length: 25 }, (_, index) =>
      summary({
        id: `s-${index}`,
        title: `Chat ${index}`,
        updatedAt: `2026-01-01T00:${String(24 - index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const client = fakeClient({ sessions });
    renderScreen(client);

    const loadMore = await screen.findByRole("button", {
      name: "Load more chats",
    });
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(screen.getByText("Chat 20")).toBeInTheDocument();
    });
    expect(screen.getByText("Chat 24")).toBeInTheDocument();
    const paged = (
      client.listGlobalChatSessionsPage as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0]);
    expect(paged[2]).toEqual({ archived: false, limit: 20, offset: 20 });
    // All 25 rows are visible after loading the final page.
    expect(
      rowsFor(...Array.from({ length: 25 }, (_, i) => `Chat ${i}`)),
    ).toHaveLength(25);
  });

  it("hides the load-more affordance on the final page", async () => {
    const client = fakeClient({ sessions: [summary({ id: "s-1" })] });
    renderScreen(client);

    await screen.findByText("Chat s-1");
    expect(
      screen.queryByRole("button", { name: "Load more chats" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to the Unarchived tab and hides archived sessions there", async () => {
    renderScreen(
      fakeClient({
        sessions: [
          summary({ id: "s-active", title: "Active chat" }),
          summary({
            id: "s-archived",
            title: "Archived chat",
            archived: true,
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Active chat")).toBeInTheDocument();
    });
    expect(tab("Unarchived")).toHaveAttribute("aria-selected", "true");
    expect(tab("Archived")).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByText("Archived chat")).not.toBeInTheDocument();
  });

  it("renders the Unarchived empty state with a New Chat CTA", async () => {
    renderScreen(fakeClient({ sessions: [] }));

    expect(await screen.findByText("No chats yet")).toBeInTheDocument();
    expect(
      screen.getByText("Start a conversation that is not tied to any Project."),
    ).toBeInTheDocument();
    const newChatButtons = screen.getAllByRole("button", {
      name: "New chat",
    });
    // One New Chat action outside the empty state plus the empty-state CTA.
    expect(newChatButtons).toHaveLength(2);
  });

  it("provides a New Chat action outside the empty state and navigates on click", async () => {
    const onNewChat = vi.fn();
    renderScreen(
      fakeClient({
        sessions: [summary({ id: "s-1", title: "Active chat" })],
      }),
      { onNewChat },
    );

    const headerNewChat = await screen.findByRole("button", {
      name: "New chat",
    });
    fireEvent.click(headerNewChat);
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No chats yet")).not.toBeInTheDocument();
  });

  it("renders rows with title, batched last-message preview, and last-updated time", async () => {
    vi.useFakeTimers({
      now: new Date("2026-01-01T12:00:00.000Z"),
      shouldAdvanceTime: true,
    });
    renderScreen(
      fakeClient({
        sessions: [
          summary({
            id: "s-1",
            title: "Plan the release notes",
            updatedAt: "2026-01-01T11:00:00.000Z",
            lastMessagePreview:
              "Here is a draft outline for the release notes.",
          }),
          summary({
            id: "s-2",
            title: "Scratch question",
            updatedAt: "2026-01-01T10:00:00.000Z",
            lastMessagePreview: "Quick question about runtime config",
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Here is a draft outline for the release notes."),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Quick question about runtime config"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("1 hour ago")).toBeInTheDocument();
      expect(screen.getByText("2 hours ago")).toBeInTheDocument();
    });

    const rows = screen
      .getAllByRole("button")
      .filter((button) =>
        button.textContent?.includes("Plan the release notes"),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain(
      "Here is a draft outline for the release notes.",
    );
    // Rename is not available from All Chats rows.
    expect(
      screen.queryByRole("button", { name: "Rename chat" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the batched host order on the Unarchived tab", async () => {
    renderScreen(
      fakeClient({
        sessions: [
          summary({
            id: "s-old",
            title: "Older chat",
            updatedAt: "2026-01-01T10:00:00.000Z",
          }),
          summary({
            id: "s-new",
            title: "Newer chat",
            updatedAt: "2026-01-01T12:00:00.000Z",
          }),
        ],
      }),
    );

    await screen.findByText("Older chat");
    const rowTexts = rowsFor("Older chat", "Newer chat").map((button) =>
      button.textContent?.trim(),
    );
    expect(rowTexts[0]).toContain("Newer chat");
    expect(rowTexts[1]).toContain("Older chat");
  });

  it("archives an unarchived session from its row action and refreshes the tabs", async () => {
    renderScreen(
      fakeClient({ sessions: [summary({ id: "s-1", title: "Active chat" })] }),
    );
    expect(await screen.findByText("Active chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Archive" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Unarchive" }),
      ).toBeInTheDocument();
    });
  });

  it("unarchives an archived session from its row action and refreshes the tabs", async () => {
    renderScreen(
      fakeClient({
        sessions: [
          summary({
            id: "s-archived",
            title: "Archived chat",
            archived: true,
            archivedAt: "2026-01-02T00:00:00.000Z",
          }),
        ],
      }),
    );
    fireEvent.click(await screen.findByRole("tab", { name: "Archived" }));
    expect(await screen.findByText("Archived chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Archived" })).toBeInTheDocument();
    });
    fireEvent.click(tab("Unarchived"));
    expect(await screen.findByText("Archived chat")).toBeInTheDocument();
  });

  it("sorts Archived rows by archived time descending while displaying last-updated time only", async () => {
    vi.useFakeTimers({
      now: new Date("2026-01-10T12:00:00.000Z"),
      shouldAdvanceTime: true,
    });
    renderScreen(
      fakeClient({
        sessions: [
          summary({
            id: "s-archived-older",
            title: "Older archived chat",
            archived: true,
            updatedAt: "2026-01-09T00:00:00.000Z",
            archivedAt: "2026-01-02T00:00:00.000Z",
          }),
          summary({ id: "s-active", title: "Active chat" }),
          summary({
            id: "s-archived-newer",
            title: "Newer archived chat",
            archived: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
            archivedAt: "2026-01-08T00:00:00.000Z",
          }),
        ],
      }),
    );
    await screen.findByText("Active chat");

    fireEvent.click(tab("Archived"));

    await waitFor(() => {
      expect(screen.getByText("Newer archived chat")).toBeInTheDocument();
    });
    const rowTexts = rowsFor("Older archived chat", "Newer archived chat").map(
      (button) => button.textContent?.trim(),
    );
    expect(rowTexts[0]).toContain("Newer archived chat");
    expect(rowTexts[1]).toContain("Older archived chat");
    // Rows show last-updated time only, never the archived time.
    expect(rowTexts[0]).toContain("9 days ago");
    expect(rowTexts[1]).toContain("yesterday");
  });

  it("paginates the Archived tab independently", async () => {
    const sessions = Array.from({ length: 22 }, (_, index) =>
      summary({
        id: `s-archived-${index}`,
        title: `Archived chat ${index}`,
        archived: true,
        archivedAt: `2026-01-${String(28 - index).padStart(2, "0")}T00:00:00.000Z`,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const client = fakeClient({ sessions });
    renderScreen(client);

    await screen.findByRole("tab", { name: "Archived" });
    fireEvent.click(tab("Archived"));

    // Archived page 1 shows its first 20 sessions.
    await waitFor(() => {
      expect(screen.getByText("Archived chat 0")).toBeInTheDocument();
    });
    expect(screen.queryByText("Archived chat 20")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load more chats" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more chats" }));
    await waitFor(() => {
      expect(screen.getByText("Archived chat 20")).toBeInTheDocument();
    });
    expect(screen.getByText("Archived chat 21")).toBeInTheDocument();
  });

  it("opens the selected Global Chat Session when a row is clicked", async () => {
    const onSelectSession = vi.fn();
    renderScreen(
      fakeClient({
        sessions: [summary({ id: "s-1", title: "Active chat" })],
      }),
      { onSelectSession },
    );

    fireEvent.click(await screen.findByText("Active chat"));
    expect(onSelectSession).toHaveBeenCalledWith("s-1");
  });

  it("shows the Archived tab empty state when nothing is archived", async () => {
    renderScreen(
      fakeClient({
        sessions: [summary({ id: "s-1", title: "Active chat" })],
      }),
    );
    await screen.findByText("Active chat");

    fireEvent.click(tab("Archived"));

    expect(tab("Archived")).toHaveAttribute("aria-selected", "true");
    expect(tab("Unarchived")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("No archived chats")).toBeInTheDocument();
    expect(screen.queryByText("Active chat")).not.toBeInTheDocument();
  });

  it("renders archived sessions on the Archived tab with batched previews", async () => {
    renderScreen(
      fakeClient({
        sessions: [
          summary({ id: "s-1", title: "Active chat" }),
          summary({
            id: "s-2",
            title: "Archived chat",
            archived: true,
            updatedAt: "2026-01-01T11:00:00.000Z",
            lastMessagePreview: "Older conversation",
          }),
        ],
      }),
    );
    await screen.findByText("Active chat");

    fireEvent.click(tab("Archived"));

    expect(await screen.findByText("Archived chat")).toBeInTheDocument();
    expect(screen.getByText("Older conversation")).toBeInTheDocument();
    expect(screen.queryByText("Active chat")).not.toBeInTheDocument();
  });

  it("renders a load error alert when the batched list fails", async () => {
    renderScreen(rejectingClient());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load chats.",
    );
  });
});
