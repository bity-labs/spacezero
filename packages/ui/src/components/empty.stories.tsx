import { Plugs } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@spacezero/ui/components/button";
import { EmptyState } from "@spacezero/ui/components/empty";

const meta: Meta<typeof EmptyState> = {
  title: "Design System/Primitives/Empty",
  component: EmptyState,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[32rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card">
        <Story />
      </div>
    ),
  ],
  args: {
    title: "No providers connected",
    description: "Connect a provider to make models available.",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIconAndAction: Story = {
  args: {
    icon: <Plugs className="size-5" aria-hidden="true" />,
    title: "No subscriptions connected",
    description: "Connect a supported subscription to make its models available.",
    actions: <Button variant="outline" size="sm">Add subscription</Button>,
  },
};
