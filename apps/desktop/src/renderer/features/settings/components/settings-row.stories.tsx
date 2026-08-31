import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@spacezero/ui/components/button";
import { Card } from "@spacezero/ui/components/card";

import { SettingsRow } from "./settings-row";

const meta: Meta<typeof SettingsRow> = {
  title: "Features/Settings/Components/Row",
  component: SettingsRow,
  decorators: [
    (Story) => (
      <Card className="w-[40rem] max-w-[calc(100vw-2rem)] gap-0 py-0">
        <Story />
      </Card>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const WithControl: Story = {
  args: {
    title: "Theme",
    description: "Choose the interface color theme.",
    children: <Button variant="outline" size="sm">System</Button>,
  },
};
