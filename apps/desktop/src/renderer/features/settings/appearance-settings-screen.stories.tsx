import type { Meta, StoryObj } from "@storybook/react-vite";

import { AppearanceSettingsScreen, type AppearanceSettingsScreenProps } from "./appearance-settings-screen";

const noOp = (): void => undefined;

const defaultArgs = {
  themePreference: "system",
  fontFamily: "system",
  thinFontAntialiasing: true,
  appearanceError: false,
  onThemePreferenceChange: noOp,
  onFontFamilyChange: noOp,
  onThinFontAntialiasingChange: noOp,
} satisfies AppearanceSettingsScreenProps;

const meta: Meta<typeof AppearanceSettingsScreen> = {
  title: "Features/Settings/Screen/Appearance",
  component: AppearanceSettingsScreen,
  parameters: { layout: "centered" },
  args: defaultArgs,
  decorators: [
    (Story) => (
      <div className="w-[760px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Error: Story = {
  args: {
    ...defaultArgs,
    appearanceError: true,
  },
};
