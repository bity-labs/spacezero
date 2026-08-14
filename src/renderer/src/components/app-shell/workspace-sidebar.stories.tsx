import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  activeProjectFixture,
  connectedAccountFixture,
  disconnectedAccountFixture,
  globalChatSelectedFixture,
  knowledgeBaseSelectedFixture,
  loadingProjectsFixture,
  manyProjectsFixture,
  noProjectsFixture,
  projectErrorFixture,
  updateReadyAccountFixture
} from './workspace-sidebar.fixtures'
import { WorkspaceSidebar } from './workspace-sidebar'

const meta = {
  title: 'Design System/Components/App Shell/Workspace/Sidebar',
  component: WorkspaceSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-screen w-80 [&>aside]:h-full">
        <Story />
      </div>
    )
  ],
  args: noProjectsFixture
} satisfies Meta<typeof WorkspaceSidebar>

export default meta

type Story = StoryObj<typeof meta>

export const NoProjects: Story = {}

export const LoadingProjects: Story = {
  args: loadingProjectsFixture
}

export const ProjectError: Story = {
  args: projectErrorFixture
}

export const ManyProjects: Story = {
  args: manyProjectsFixture
}

export const ActiveProject: Story = {
  args: activeProjectFixture
}

export const GlobalChatSelected: Story = {
  args: globalChatSelectedFixture
}

export const KnowledgeBaseSelected: Story = {
  args: knowledgeBaseSelectedFixture
}

export const ConnectedAccount: Story = {
  args: connectedAccountFixture
}

export const DisconnectedAccount: Story = {
  args: disconnectedAccountFixture
}

export const UpdateReadyAccount: Story = {
  args: updateReadyAccountFixture
}
