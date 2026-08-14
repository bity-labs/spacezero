import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  emptyProjectsFixture,
  globalChatSelectedFixture,
  knowledgeBaseSelectedFixture,
  narrowLeftSidebarFixture,
  projectSelectedFixture,
  sidePaneOpenFixture,
  wideLeftSidebarFixture
} from './workspace-shell-layout.fixtures'
import { WorkspaceShellLayout } from './workspace-shell-layout'

const meta = {
  title: 'Design System/Components/Workspace/Shell',
  component: WorkspaceShellLayout,
  parameters: { layout: 'fullscreen' },
  args: emptyProjectsFixture
} satisfies Meta<typeof WorkspaceShellLayout>

export default meta

type Story = StoryObj<typeof meta>

export const EmptyProjects: Story = {}

export const ProjectSelected: Story = {
  args: projectSelectedFixture
}

export const GlobalChatSelected: Story = {
  args: globalChatSelectedFixture
}

export const KnowledgeBaseSelected: Story = {
  args: knowledgeBaseSelectedFixture
}

export const SidePaneOpen: Story = {
  args: sidePaneOpenFixture
}

export const NarrowLeftSidebar: Story = {
  args: narrowLeftSidebarFixture
}

export const WideLeftSidebar: Story = {
  args: wideLeftSidebarFixture
}
