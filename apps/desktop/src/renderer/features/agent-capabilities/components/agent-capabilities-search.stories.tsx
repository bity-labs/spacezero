import { Card } from "@spacezero/ui/components/card";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "../../../styles.css";

import { AgentCapabilitiesSearch } from "./agent-capabilities-search";

const meta: Meta<typeof AgentCapabilitiesSearch> = {
  title: "Features/Agent Capabilities/Components/Search",
  component: AgentCapabilitiesSearch,
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
    label: "Search skills",
    placeholder: "Search skills by name...",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
