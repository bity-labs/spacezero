import type { Meta, StoryObj } from '@storybook/react-vite'

import { AccountSettingsScreen } from '../../../settings/renderer/screens/account-settings-screen'
import {
  connectedGitHubAccountFixture,
  deviceCodeGitHubAccountFixture,
  disconnectedGitHubAccountFixture,
  errorGitHubAccountFixture
} from './github-account-settings-screen.fixtures'
import { GitHubAccountSettingsScreen } from './github-account-settings-screen'

const meta = {
  title: 'Screens/Settings/Account',
  component: GitHubAccountSettingsScreen,
  decorators: [
    (Story) => (
      <div className="w-[746px] max-w-[calc(100vw-2rem)] py-8">
        <AccountSettingsScreen githubAccount={<Story />} />
      </div>
    )
  ],
  args: disconnectedGitHubAccountFixture
} satisfies Meta<typeof GitHubAccountSettingsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Disconnected: Story = {}

export const DeviceCode: Story = {
  args: deviceCodeGitHubAccountFixture
}

export const Connected: Story = {
  args: connectedGitHubAccountFixture
}

export const Error: Story = {
  args: errorGitHubAccountFixture
}
