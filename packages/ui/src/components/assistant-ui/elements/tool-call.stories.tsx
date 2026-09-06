import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";

import { ToolCall } from "@spacezero/ui/components/assistant-ui/elements/tool-call";

const meta: Meta<typeof ToolCall> = {
  title: "Design System/Assistant UI/Elements/Tool Call",
  component: ToolCall,
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
    label: "Read workspace status",
    activeLabel: "Reading workspace status",
    query: "workspace.getStatus",
    request: '{"includeArchived": false}',
    result: "Host connected · 4 projects · 2 active chats",
    running: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledToolCall(args: Omit<ComponentProps<typeof ToolCall>, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return <ToolCall {...args} open={open} onOpenChange={setOpen} />;
}

export const Completed: Story = {
  render: (args) => <ControlledToolCall {...args} />,
};

export const OpenCompleted: Story = {
  render: (args) => <ToolCall {...args} open onOpenChange={() => undefined} />,
};

export const Running: Story = {
  args: {
    activeLabel: "Running projects.listSummaries",
    query: "projects.listSummaries",
    request: "{}",
    result: "",
    running: true,
  },
  render: (args) => <ControlledToolCall {...args} />,
};
