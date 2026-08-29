import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spacezero/ui/components/select";

const meta: Meta<typeof Select> = {
  title: "Design System/Primitives/Select",
  component: Select,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="system">
      <SelectTrigger className="w-48" aria-label="Theme">
        <SelectValue>{(value: string) => themeLabels[value] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="system">System</SelectItem>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Small: Story = {
  render: () => (
    <Select defaultValue="inter">
      <SelectTrigger size="sm" className="w-48" aria-label="Font">
        <SelectValue>{(value: string) => fontLabels[value] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="system">System font</SelectItem>
          <SelectItem value="inter">Inter</SelectItem>
          <SelectItem value="sf-pro">SF Pro Text</SelectItem>
          <SelectItem value="jetbrains-mono">JetBrains Mono</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

const themeLabels: Record<string, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const fontLabels: Record<string, string> = {
  system: "System font",
  inter: "Inter",
  "sf-pro": "SF Pro Text",
  "jetbrains-mono": "JetBrains Mono",
};
