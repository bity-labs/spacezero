import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

import { MessagePair } from "@spacezero/ui/components/assistant-ui/elements/message-pair";

const reply =
  "Space Zero can keep the chat surface focused while the Workspace Host remains the source of truth for sessions, turns, and durable history.".split(
    " ",
  );

const meta: Meta<typeof MessagePair> = {
  title: "Design System/Assistant UI/Elements/Message Pair",
  component: MessagePair,
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
    userMessage: "How should we wire Global Chat?",
    words: reply,
    visibleWords: reply.length,
    streaming: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Bubble: Story = {};

export const Flat: Story = {
  args: {
    variant: "flat",
  },
};

export const PartialStreaming: Story = {
  args: {
    visibleWords: 13,
    streaming: true,
  },
};

function StreamingDemo() {
  const [visibleWords, setVisibleWords] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVisibleWords((current) => {
        if (current >= reply.length) return 0;
        return current + 1;
      });
    }, 160);

    return () => window.clearInterval(id);
  }, []);

  return (
    <MessagePair
      userMessage="Show me the first Global Chat turn."
      words={reply}
      visibleWords={visibleWords}
      streaming={visibleWords < reply.length}
    />
  );
}

export const AnimatedStreaming: Story = {
  render: () => <StreamingDemo />,
};
