import type { Meta, StoryObj } from '@storybook/react-vite'

import { SidebarMenu, SidebarProvider } from '@renderer/components/ui/sidebar'

import {
  projectSidebarCallbacks,
  projectSidebarProjects,
  projectSidebarSessions
} from './project-sidebar.fixtures'
import { ProjectItem } from './project-item'

const meta = {
  title: 'Features/Projects/Components/Project Item',
  component: ProjectItem,
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="w-64 rounded-lg border border-sidebar-border bg-sidebar py-3 text-sidebar-foreground">
          <SidebarMenu className="mt-2 px-2" aria-label="Projects">
            <Story />
          </SidebarMenu>
        </div>
      </SidebarProvider>
    )
  ],
  args: {
    project: projectSidebarProjects[0],
    active: true,
    expanded: true,
    sessions: projectSidebarSessions,
    activeSessionId: projectSidebarSessions[0].id,
    ...projectSidebarCallbacks
  }
} satisfies Meta<typeof ProjectItem>

export default meta

type Story = StoryObj<typeof meta>

export const ExpandedActive: Story = {}

export const Collapsed: Story = {
  args: {
    active: false,
    expanded: false
  }
}

export const EmptySessions: Story = {
  args: {
    sessions: []
  }
}
