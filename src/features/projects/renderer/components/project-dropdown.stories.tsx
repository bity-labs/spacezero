import type { Meta, StoryObj } from '@storybook/react-vite'

import { SidebarProvider } from '@renderer/components/ui/sidebar'

import {
  projectSidebarCallbacks,
  projectSidebarProjects,
  projectSidebarSessions,
  projectSidebarSessionsByProjectId
} from './project-sidebar.fixtures'
import { ProjectDropdown } from './project-dropdown'

const meta = {
  title: 'Features/Projects/Components/Project Dropdown',
  component: ProjectDropdown,
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="w-64 rounded-lg border border-sidebar-border bg-sidebar py-3 text-sidebar-foreground">
          <Story />
        </div>
      </SidebarProvider>
    )
  ],
  args: {
    projects: projectSidebarProjects,
    activeProject: projectSidebarProjects[0],
    status: 'ready',
    error: null,
    sessionsByProjectId: projectSidebarSessionsByProjectId,
    activeSessionId: projectSidebarSessions[0].id,
    ...projectSidebarCallbacks
  }
} satisfies Meta<typeof ProjectDropdown>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    projects: [],
    activeProject: null,
    sessionsByProjectId: new Map()
  }
}
