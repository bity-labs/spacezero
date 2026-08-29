import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "@spacezero/ui/components/switch";

const meta: Meta<typeof Switch> = {
  title: "Design System/Primitives/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
  },
  args: {
    "aria-label": "Enable setting",
    defaultChecked: true,
    size: "default",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const States: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Switch aria-label="On" defaultChecked />
      <Switch aria-label="Off" />
      <Switch aria-label="Disabled" defaultChecked disabled />
      <Switch aria-label="Small" size="sm" defaultChecked />
    </div>
  ),
};
