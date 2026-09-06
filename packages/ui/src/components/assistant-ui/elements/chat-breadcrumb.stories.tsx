import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  ChatBreadcrumb,
  type ChatBreadcrumbEntry,
} from "@spacezero/ui/components/assistant-ui/elements/chat-breadcrumb";

const meta: Meta<typeof ChatBreadcrumb> = {
  title: "Features/Chats/Chat Header",
  component: ChatBreadcrumb,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[42rem] max-w-[calc(100vw-2rem)] rounded-lg border p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const chats: readonly ChatBreadcrumbEntry[] = [
  { id: "chat-1", title: "Reply with exactly: ok" },
  { id: "chat-2", title: "Plan the release notes for beta 17" },
  { id: "chat-3", title: "Explain the follow-up queue" },
];

function InteractiveHeader() {
  const [activeChatId, setActiveChatId] = useState("chat-1");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const active = chats.find((chat) => chat.id === activeChatId)!;
  return (
    <ChatBreadcrumb
      sectionLabel="Chats"
      onSectionClick={() => undefined}
      chatTitle={titles[active.id] ?? active.title}
      chats={chats.map((chat) => ({
        ...chat,
        title: titles[chat.id] ?? chat.title,
      }))}
      activeChatId={activeChatId}
      currentBadgeLabel="CURRENT"
      onSelectChat={setActiveChatId}
      renameLabel="Rename chat"
      onRename={(title) =>
        setTitles((current) => ({ ...current, [active.id]: title }))
      }
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveHeader />,
};

export const MenuOpen: Story = {
  render: () => (
    <ChatBreadcrumb
      sectionLabel="Chats"
      onSectionClick={() => undefined}
      chatTitle="Reply with exactly: ok"
      chats={chats}
      activeChatId="chat-1"
      currentBadgeLabel="CURRENT"
      defaultMenuOpen
    />
  ),
};

export const Editing: Story = {
  render: () => (
    <ChatBreadcrumb
      sectionLabel="Chats"
      onSectionClick={() => undefined}
      chatTitle="Reply with exactly: ok"
      defaultEditing
    />
  ),
};
