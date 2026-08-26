import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "@spacezero/ui/components/input";

const meta: Meta<typeof Input> = {
  title: "Design System/Primitives/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    placeholder: "Project name",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithValue: Story = {
  args: {
    defaultValue: "Space Zero",
  },
};
