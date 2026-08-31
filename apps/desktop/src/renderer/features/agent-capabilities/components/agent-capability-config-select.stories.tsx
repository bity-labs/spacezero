import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import "../../../styles.css";

import {
  AgentCapabilityConfigSelect,
  type AgentCapabilityConfigScope,
} from "./agent-capability-config-select";

const meta: Meta<typeof AgentCapabilityConfigSelectStory> = {
  title: "Features/Agent Capabilities/Components/Config Select",
  component: AgentCapabilityConfigSelectStory,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function AgentCapabilityConfigSelectStory(): ReactElement {
  const [value, setValue] = useState<AgentCapabilityConfigScope>("global");

  return <AgentCapabilityConfigSelect value={value} onValueChange={setValue} />;
}
