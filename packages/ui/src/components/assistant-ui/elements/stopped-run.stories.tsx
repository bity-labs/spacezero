import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoppedRun } from "@spacezero/ui/components/assistant-ui/elements/stopped-run";

const words =
  "I started checking the Workspace Host event stream and found that live tool updates are already available for both session types.".split(
    " ",
  );

const meta: Meta<typeof StoppedRun> = {
  title: "Design System/Assistant UI/Elements/Stopped Run",
  component: StoppedRun,
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
    words,
    reason: "stopped by you",
    onContinue: () => undefined,
    onDiscard: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const StoppedByUser: Story = {};

export const ConnectionLost: Story = {
  args: {
    reason: "connection lost",
  },
};

export const LengthLimit: Story = {
  args: {
    reason: "hit length limit",
  },
};
