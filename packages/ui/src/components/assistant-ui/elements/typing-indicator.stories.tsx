import type { Meta, StoryObj } from "@storybook/react-vite";

import { TypingIndicator } from "@spacezero/ui/components/assistant-ui/elements/typing-indicator";

const meta: Meta<typeof TypingIndicator> = {
  title: "Design System/Assistant UI/Elements/Typing Indicator",
  component: TypingIndicator,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[42rem] max-w-[calc(100vw-2rem)] p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Bubble: Story = {};

export const Bare: Story = {
  args: {
    variant: "bare",
  },
};

export const InAssistantLane: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <TypingIndicator />
      <p className="text-xs text-muted-foreground">Waiting for the first token…</p>
    </div>
  ),
};
