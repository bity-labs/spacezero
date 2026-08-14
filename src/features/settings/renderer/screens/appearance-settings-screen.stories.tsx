import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  appearanceSettingsScreenDefaultArgs,
  appearanceSettingsScreenErrorArgs
} from './appearance-settings-screen.fixtures'
import { AppearanceSettingsScreen } from './appearance-settings-screen'

const meta = {
  title: 'Screens/Settings/Appearance',
  component: AppearanceSettingsScreen,
  parameters: { layout: 'centered' },
  args: appearanceSettingsScreenDefaultArgs,
  decorators: [
    (Story) => (
      <div className="w-[760px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppearanceSettingsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Error: Story = {
  args: appearanceSettingsScreenErrorArgs
}
