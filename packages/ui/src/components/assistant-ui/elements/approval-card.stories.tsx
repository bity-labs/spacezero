import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  ApprovalCard,
  type ApprovalState,
} from "@spacezero/ui/components/assistant-ui/elements/approval-card";

const meta: Meta<typeof ApprovalCard> = {
  title: "Design System/Assistant UI/Elements/Approval Card",
  component: ApprovalCard,
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
    state: "request",
    title: "Create a new global chat?",
    subtitle: "globalChats.createWithPrompt requires confirmation.",
    command: 'globalChats.createWithPrompt({ prompt: "Plan the next release" })',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Request: Story = {};

export const Running: Story = {
  args: { state: "running" },
};

export const Done: Story = {
  args: { state: "done" },
};

export const Denied: Story = {
  args: { state: "denied" },
};

function InteractiveApproval() {
  const [state, setState] = useState<ApprovalState>("request");

  return (
    <ApprovalCard
      state={state}
      title="Create a new global chat?"
      subtitle="This write tool needs explicit approval."
      command={'globalChats.createWithPrompt({ prompt: "Summarize workspace status" })'}
      onAllowOnce={() => {
        setState("running");
        window.setTimeout(() => setState("done"), 1400);
      }}
      onAlwaysAllow={() => setState("running")}
      onDeny={() => setState("denied")}
    />
  );
}

export const Interactive: Story = {
  render: () => <InteractiveApproval />,
};
