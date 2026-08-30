import { Card } from "@spacezero/ui/components/card";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "../../../styles.css";

import { AgentCapabilityRow } from "./agent-capability-row";

const meta: Meta<typeof AgentCapabilityRow> = {
  title: "Features/Agent Capabilities/Components/Row",
  component: AgentCapabilityRow,
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-8">
        <Card className="gap-0 py-0">
          <Story />
        </Card>
      </div>
    ),
  ],
  args: {
    name: "code-review",
    scope: "User",
    description:
      "Review a GitHub pull request when a review pass is explicitly requested.",
    path: "<project>/.agents/skills/code-review/SKILL.md",
    enabled: true,
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Editing: Story = {
  args: {
    editing: true,
  },
};
