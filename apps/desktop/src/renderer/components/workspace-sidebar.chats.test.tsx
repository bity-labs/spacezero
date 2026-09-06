import type { GlobalChatSessionSummary } from "@spacezero/host-contracts";
import { SidebarProvider } from "@spacezero/ui/components/sidebar";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../i18n/index.js";

import { WorkspaceSidebar } from "./workspace-sidebar.js";

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

const chat = (
  id: string,
  overrides: Partial<GlobalChatSessionSummary> = {},
): GlobalChatSessionSummary => summary({ id, ...overrides });

const renderSidebar = (
  overrides: Partial<Parameters<typeof WorkspaceSidebar>[0]> = {},
): void => {
  render(
    <SidebarProvider>
      <WorkspaceSidebar
        open
        activeView="workspace"
        activeChatId={undefined}
        chats={[chat("chat-1", { title: "First chat" })]}
        chatsExpanded
        projectsExpanded
        onOpenChange={() => undefined}
        onSelectKnowledgeBase={() => undefined}
        onSelectAgentCapabilities={() => undefined}
        onSelectChat={() => undefined}
        onToggleChats={() => undefined}
        onNewChat={() => undefined}
        onAllChats={() => undefined}
        onToggleProjects={() => undefined}
        onFilterProjects={() => undefined}
        onAddProject={() => undefined}
        onOpenSettings={() => undefined}
        {...overrides}
      />
    </SidebarProvider>,
  );
};

const chatRowButtons = (): HTMLElement[] =>
  screen
    .getAllByRole("button")
    .filter((button) =>
      /^(Chat \d|First chat|Second chat)/.test(
        button.textContent?.trim() ?? "",
      ),
    );

describe("WorkspaceSidebar chats section", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the expandable Chats section directly above Projects", () => {
    renderSidebar();

    const chatsSection = screen.getByLabelText("Chats");
    const projectsSection = screen.getByLabelText("Projects");
    expect(chatsSection).toBeInTheDocument();
    expect(projectsSection).toBeInTheDocument();
    expect(
      chatsSection.compareDocumentPosition(projectsSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders chat rows with the title only", () => {
    renderSidebar({
      chats: [
        chat("chat-1", {
          title: "First chat",
          updatedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });

    const row = screen.getByRole("button", { name: "First chat" });
    expect(row).toBeInTheDocument();
    expect(row.textContent).toBe("First chat");
    expect(screen.queryByText(/2026-01-/)).not.toBeInTheDocument();
  });

  it("renders chat rows in the provided recent order and highlights the active chat", () => {
    renderSidebar({
      chats: [
        chat("chat-2", { title: "Second chat" }),
        chat("chat-1", { title: "First chat" }),
      ],
      activeChatId: "chat-1",
    });

    const rows = screen
      .getAllByRole("button")
      .filter((button) =>
        ["Second chat", "First chat"].includes(
          button.textContent?.trim() ?? "",
        ),
      );
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      "Second chat",
      "First chat",
    ]);
    const [inactiveRow, activeRow] = rows;
    expect(inactiveRow).toBeDefined();
    expect(activeRow).toBeDefined();
    expect(inactiveRow!).not.toHaveAttribute("data-active");
    expect(activeRow!).toHaveAttribute("data-active");
  });

  it("renders a disabled archive affordance on each chat row", () => {
    renderSidebar({
      chats: [
        chat("chat-1", { title: "First chat" }),
        chat("chat-2", { title: "Second chat" }),
      ],
    });

    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    expect(archiveButtons).toHaveLength(2);
    for (const button of archiveButtons) {
      expect(button).toBeDisabled();
    }

    const onSelectChat = vi.fn();
    cleanup();
    renderSidebar({
      chats: [chat("chat-1", { title: "First chat" })],
      onSelectChat,
    });
    const archiveAction = screen.getAllByRole("button", { name: "Archive" })[0];
    expect(archiveAction).toBeDefined();
    fireEvent.click(archiveAction!);
    expect(onSelectChat).not.toHaveBeenCalled();
  });

  it("exposes New chat and All chats actions in the Chats section", () => {
    renderSidebar();

    const chatsSection = screen.getByLabelText("Chats");
    expect(
      chatsSection.querySelector('[aria-label="New chat"]'),
    ).not.toBeNull();
    expect(
      chatsSection.querySelector('[aria-label="All chats"]'),
    ).not.toBeNull();
  });

  it("keeps the chat count to the chats it is given without inventing rows", () => {
    const chats = Array.from({ length: 10 }, (_, index) =>
      chat(`chat-${index}`, { title: `Chat ${index}` }),
    );
    renderSidebar({ chats });

    expect(screen.getByText("Chat 0")).toBeInTheDocument();
    expect(screen.getByText("Chat 9")).toBeInTheDocument();
    expect(screen.queryByText("Old conversation")).not.toBeInTheDocument();
    expect(screen.queryByText("fake-archived")).not.toBeInTheDocument();
    expect(chatRowButtons()).toHaveLength(10);
  });
});
