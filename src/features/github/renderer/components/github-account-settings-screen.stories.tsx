import type { Meta, StoryObj } from '@storybook/react-vite'

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
        <div className="mb-6">
          <h2 className="text-xl font-medium">Account</h2>
          <div className="mt-8 space-y-3">
            <div className="px-2">
              <h3 className="text-sm text-muted-foreground">GitHub</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                GitHub is optional. Local Projects continue to work without a connection.
              </p>
            </div>
            <Story />
          </div>
        </div>
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
