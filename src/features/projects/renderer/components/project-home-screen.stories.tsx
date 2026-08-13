import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  githubDisconnectedProjectHomeFixture,
  localOnlyProjectHomeFixture,
  repositoryConnectedProjectHomeFixture,
  repositoryLinkNeededProjectHomeFixture,
  summariesEmptyProjectHomeFixture,
  summariesErrorProjectHomeFixture,
  summariesLoadingProjectHomeFixture,
  trustOffProjectHomeFixture,
  trustOnProjectHomeFixture
} from './project-home-screen.fixtures'
import { ProjectHomeScreen } from './project-home-screen'

const meta = {
  title: 'Screens/Projects/Project Home',
  component: ProjectHomeScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen min-h-[680px] bg-background">
        <Story />
      </div>
    )
  ],
  args: localOnlyProjectHomeFixture
} satisfies Meta<typeof ProjectHomeScreen>

export default meta

type Story = StoryObj<typeof meta>

export const LocalOnly: Story = {}

export const GitHubDisconnected: Story = {
  args: githubDisconnectedProjectHomeFixture
}

export const RepositoryLinkNeeded: Story = {
  args: repositoryLinkNeededProjectHomeFixture
}

export const RepositoryConnected: Story = {
  args: repositoryConnectedProjectHomeFixture
}

export const SummariesLoading: Story = {
  args: summariesLoadingProjectHomeFixture
}

export const SummariesError: Story = {
  args: summariesErrorProjectHomeFixture
}

export const SummariesEmpty: Story = {
  args: summariesEmptyProjectHomeFixture
}

export const TrustProjectResourcesOff: Story = {
  args: trustOffProjectHomeFixture
}

export const TrustProjectResourcesOn: Story = {
  args: trustOnProjectHomeFixture
}
