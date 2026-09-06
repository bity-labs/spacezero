import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import { ThinkingIndicator } from "@spacezero/ui/components/assistant-ui/elements/thinking-indicator";

const meta: Meta<typeof ThinkingIndicator> = {
  title: "Design System/Assistant UI/Elements/Thinking Indicator",
  component: ThinkingIndicator,
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
    label: "Thinking",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Thinking: Story = {};

export const RunningTool: Story = {
  args: {
    label: "Running workspace.getStatus",
    elapsed: "8s",
  },
};

const thinkingLabels = ["Thinking", "Preparing tools", "Running projects.listSummaries", "Composing answer"];

function ChangingLabelDemo() {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed((current) => current + 1);
      setIndex((current) => (current + 1) % thinkingLabels.length);
    }, 1800);

    return () => window.clearInterval(id);
  }, []);

  return <ThinkingIndicator label={thinkingLabels[index] ?? "Thinking"} elapsed={`${elapsed}s`} />;
}

export const ChangingLabel: Story = {
  render: () => <ChangingLabelDemo />,
};
