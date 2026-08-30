import type { Meta, StoryObj } from "@storybook/react-vite";

import "../../styles.css";

import { AgentCapabilitiesPage } from "./agent-capabilities-page";

const meta: Meta<typeof AgentCapabilitiesPage> = {
  title: "Features/Agent Capabilities/Page",
  component: AgentCapabilitiesPage,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
