import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ErrorState } from "@spacezero/ui/components/assistant-ui/elements/error-state";

const meta: Meta<typeof ErrorState> = {
  title: "Design System/Assistant UI/Elements/Error State",
  component: ErrorState,
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
    title: "Couldn't reach the model",
    detail: "The request timed out before the assistant produced a response.",
    retrying: false,
    onRetry: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Failed: Story = {};

export const Retrying: Story = {
  args: {
    retrying: true,
  },
};

function InteractiveRetryDemo() {
  const [retrying, setRetrying] = useState(false);

  return (
    <ErrorState
      title="Turn failed"
      detail="The assistant turn failed. Retry to start a new attempt from the same prompt."
      retrying={retrying}
      onRetry={() => {
        setRetrying(true);
        window.setTimeout(() => setRetrying(false), 1600);
      }}
    />
  );
}

export const InteractiveRetry: Story = {
  render: () => <InteractiveRetryDemo />,
};
