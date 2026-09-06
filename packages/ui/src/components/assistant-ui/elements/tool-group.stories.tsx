import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";

import {
  ToolGroup,
  type GroupedTool,
} from "@spacezero/ui/components/assistant-ui/elements/tool-group";

const tools: GroupedTool[] = [
  { id: "1", name: "workspace.getStatus", target: "Inspect workspace status", state: "done", durationMs: 42 },
  { id: "2", name: "projects.listSummaries", target: "List registered projects", state: "done", durationMs: 87 },
  { id: "3", name: "globalChats.listSummaries", target: "List recent chats", state: "running" },
];

const meta: Meta<typeof ToolGroup> = {
  title: "Design System/Assistant UI/Elements/Tool Group",
  component: ToolGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[42rem] max-w-[calc(100vw-2rem)] p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    label: "Read workspace context",
    tools,
    open: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledToolGroup(args: Omit<ComponentProps<typeof ToolGroup>, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return <ToolGroup {...args} open={open} onOpenChange={setOpen} />;
}

export const Running: Story = {
  render: (args) => <ControlledToolGroup {...args} />,
};

export const OpenCompleted: Story = {
  args: {
    tools: tools.map((tool) => ({ ...tool, state: "done" as const, durationMs: tool.durationMs ?? 120 })),
    open: true,
  },
};

export const Failed: Story = {
  args: {
    tools: [
      tools[0]!,
      { id: "2", name: "globalChats.listSummaries", target: "List recent chats", state: "failed", durationMs: 64 },
    ],
    open: true,
  },
};
