import type {
  GlobalChatSessionClient,
} from "@spacezero/client-runtime";
import type {
  GlobalChatSessionMessage,
  GlobalChatSessionSummary,
} from "@spacezero/host-contracts";import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

interface FakeClientOptions {
  sessions: readonly GlobalChatSessionSummary[];
  lastMessages?: ReadonlyMap<string, GlobalChatSessionMessage>;
}

const fakeClient = ({
  sessions,
  lastMessages = new Map(),
}: FakeClientOptions): GlobalChatSessionClient => ({
  listGlobalChatSessions: vi.fn(async () => sessions),
  listMessages: vi.fn(async (sessionId: string, options?: { limit?: number }) => {
    expect(options?.limit).toBe(1);
    const message = lastMessages.get(sessionId);
    return {
      session: summary({ id: sessionId }),
      messages: message ? [message] : [],
    };
  }),
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

describe("AllChatsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a loading status before the session list resolves", () => {
    renderScreen({
      listGlobalChatSessions: () => new Promise(() => undefined),
      listMessages: () => new Promise(() => undefined),
    } as unknown as GlobalChatSessionClient);

    expect(screen.getByRole("status")).toHaveTextContent("Loading chats");
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

    expect(
      await screen.findByText("No chats yet"),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByText("No chats yet"),
    ).not.toBeInTheDocument();
  });

  it("renders rows with title, last-message preview, and last-updated time", async () => {
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
          }),
          summary({
            id: "s-2",
            title: "Scratch question",
            updatedAt: "2026-01-01T10:00:00.000Z",
          }),
        ],
        lastMessages: new Map([
          [
            "s-1",
            message({
              id: "m-1",
              role: "assistant",
              text: "Here is a draft outline for the release notes.",
              sequence: 2,
            }),
          ],
          [
            "s-2",
            message({
              id: "m-2",
              role: "user",
              text: "Quick question about runtime config",
              sequence: 1,
            }),
          ],
        ]),
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
  });

  it("sorts Unarchived rows by last updated descending", async () => {
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
    const rowTexts = screen
      .getAllByRole("button")
      .filter((button) =>
        ["Older chat", "Newer chat"].some((title) =>
          button.textContent?.includes(title),
        ),
      )
      .map((button) => button.textContent?.trim());
    expect(rowTexts[0]).toContain("Newer chat");
    expect(rowTexts[1]).toContain("Older chat");
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

  it("renders archived sessions on the Archived tab", async () => {
    renderScreen(
      fakeClient({
        sessions: [
          summary({ id: "s-1", title: "Active chat" }),
          summary({
            id: "s-2",
            title: "Archived chat",
            archived: true,
            updatedAt: "2026-01-01T11:00:00.000Z",
          }),
        ],
        lastMessages: new Map([
          [
            "s-2",
            message({
              id: "m-2",
              role: "user",
              text: "Older conversation",
            }),
          ],
        ]),
      }),
    );
    await screen.findByText("Active chat");

    fireEvent.click(tab("Archived"));

    expect(await screen.findByText("Archived chat")).toBeInTheDocument();
    expect(screen.getByText("Older conversation")).toBeInTheDocument();
    expect(screen.queryByText("Active chat")).not.toBeInTheDocument();
  });

  it("renders a load error alert when the session list fails", async () => {
    renderScreen({
      listGlobalChatSessions: () => Promise.reject(new Error("down")),
      listMessages: () => Promise.reject(new Error("down")),
    } as unknown as GlobalChatSessionClient);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load chats.",
    );
  });
});
