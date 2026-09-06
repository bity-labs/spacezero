import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  ChatListScreen,
  type ChatListRow,
} from "@spacezero/ui/components/assistant-ui/elements/chat-list";

const meta: Meta<typeof ChatListScreen> = {
  title: "Features/Chats/Chat List Screen",
  component: ChatListScreen,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground h-[42rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const currentRows: readonly ChatListRow[] = [
  {
    id: "chat-1",
    title: "Reply with exactly: ok",
    preview: "ok",
    updatedAt: "2 min ago",
  },
  {
    id: "chat-2",
    title: "Plan the release notes for beta 17",
    preview:
      "Here is a draft outline for the beta 17 release notes, starting with the Local Host repair…",
    updatedAt: "1 h ago",
  },
  {
    id: "chat-3",
    title: "Explain the follow-up queue",
    preview:
      "While a turn is running, later prompts are queued as follow-ups and run after the current turn…",
    updatedAt: "Yesterday",
  },
];

const archivedRows: readonly ChatListRow[] = [
  {
    id: "chat-4",
    title: "Old scratch conversation",
    preview: "Never mind, keeping the previous approach.",
    updatedAt: "3 d ago",
  },
];

function InteractiveChatListScreen() {
  const [tab, setTab] = useState("current");
  return (
    <ChatListScreen
      title="Chats"
      description="App-level conversations that are not tied to a Project or Git lifecycle."
      newChatLabel="New chat"
      onNewChat={() => undefined}
      tabs={[
        { id: "current", label: "Current" },
        { id: "archived", label: "Archived" },
      ]}
      activeTabId={tab}
      onTabChange={setTab}
      rows={tab === "current" ? currentRows : archivedRows}
      emptyTitle="No archived chats"
      emptyDescription="Archived chats are history-only until you unarchive them."
      emptyActionLabel="New chat"
      onSelectRow={() => undefined}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveChatListScreen />,
};

export const Empty: Story = {
  render: () => (
    <ChatListScreen
      title="Chats"
      description="App-level conversations that are not tied to a Project or Git lifecycle."
      newChatLabel="New chat"
      onNewChat={() => undefined}
      tabs={[
        { id: "current", label: "Current" },
        { id: "archived", label: "Archived" },
      ]}
      activeTabId="current"
      rows={[]}
      emptyTitle="No chats yet"
      emptyDescription="Start a conversation that is not tied to any Project."
      emptyActionLabel="New chat"
    />
  ),
};
