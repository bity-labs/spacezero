import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "@spacezero/ui";

const meta = {
  title: "Design System/Primitives/Input",
  component: Input,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    "aria-label": "Project name",
    placeholder: "Project name",
  },
};

export const States: Story = {
  render: () => (
    <div className="grid w-80 gap-4">
      <Input aria-label="Repository path" placeholder="Repository path" />
      <Input aria-label="Disabled path" disabled placeholder="Disabled" />
      <Input aria-label="Invalid token" aria-invalid placeholder="Invalid" />
    </div>
  ),
};
