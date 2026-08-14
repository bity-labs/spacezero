import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  aboutSettingsScreenCheckingArgs,
  aboutSettingsScreenDefaultArgs,
  aboutSettingsScreenErrorArgs
} from './about-settings-screen.fixtures'
import { AboutSettingsScreen } from './about-settings-screen'

const meta = {
  title: 'Screens/Settings/About',
  component: AboutSettingsScreen,
  parameters: { layout: 'centered' },
  args: aboutSettingsScreenDefaultArgs,
  decorators: [
    (Story) => (
      <div className="w-[760px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AboutSettingsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const UpdateAvailable: Story = {}

export const Checking: Story = {
  args: aboutSettingsScreenCheckingArgs
}

export const Error: Story = {
  args: aboutSettingsScreenErrorArgs
}
