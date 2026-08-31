import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@spacezero/ui/components/button";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const meta: Meta<typeof SettingsSection> = {
  title: "Features/Settings/Components/Section",
  component: SettingsSection,
  decorators: [
    (Story) => (
      <div className="w-[40rem] max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Appearance: Story = {
  args: {
    title: "Appearance",
    description: "Choose how Space Zero looks while you work.",
    children: (
      <>
        <SettingsRow title="Theme" description="Choose the interface color theme.">
          <Button variant="outline" size="sm">System</Button>
        </SettingsRow>
        <SettingsRow title="Font" description="Choose the interface typeface.">
          <Button variant="outline" size="sm">Inter</Button>
        </SettingsRow>
      </>
    ),
  },
};

export const WithError: Story = {
  args: {
    ...Appearance.args,
    error: "Could not update appearance settings.",
  },
};
