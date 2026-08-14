import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  defaultGeneralSettingsFixture,
  loadingErrorGeneralSettingsFixture
} from './general-settings-screen.fixtures'
import { GeneralSettingsScreen } from './general-settings-screen'

const meta = {
  title: 'Screens/Settings/General',
  component: GeneralSettingsScreen,
  decorators: [
    (Story) => (
      <div className="w-[746px] max-w-[calc(100vw-2rem)] py-8">
        <Story />
      </div>
    )
  ],
  args: defaultGeneralSettingsFixture
} satisfies Meta<typeof GeneralSettingsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LoadingWithErrors: Story = {
  args: loadingErrorGeneralSettingsFixture
}
