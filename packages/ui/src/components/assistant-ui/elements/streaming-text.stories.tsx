import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import {
  StreamingText,
  type Segment,
} from "@spacezero/ui/components/assistant-ui/elements/streaming-text";

const segments: Segment[] = [
  { text: "Space Zero can render assistant output as it arrives while keeping" },
  { text: "Workspace Host", mono: true },
  { text: "as the source of truth for durable Global Chat state." },
];

const wordCount = segments.reduce(
  (total, segment) => total + segment.text.split(" ").length,
  0,
);

const meta: Meta<typeof StreamingText> = {
  title: "Design System/Assistant UI/Elements/Streaming Text",
  component: StreamingText,
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
    segments,
    count: wordCount,
    streaming: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};

export const Partial: Story = {
  args: {
    count: 11,
    streaming: true,
  },
};

function AnimatedDemo() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCount((current) => {
        if (current >= wordCount) return 0;
        return current + 1;
      });
    }, 140);

    return () => window.clearInterval(id);
  }, []);

  return <StreamingText segments={segments} count={count} streaming={count < wordCount} />;
}

export const Animated: Story = {
  render: () => <AnimatedDemo />,
};

export const Wide: Story = {
  args: {
    className: "max-w-none text-base",
  },
};
