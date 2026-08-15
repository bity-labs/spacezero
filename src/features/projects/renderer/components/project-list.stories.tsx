import type { Meta, StoryObj } from '@storybook/react-vite'

import { SidebarProvider } from '@renderer/components/ui/sidebar'

import {
  projectSidebarCallbacks,
  projectSidebarProjects,
  projectSidebarSessions,
  projectSidebarSessionsByProjectId
} from './project-sidebar.fixtures'
import { ProjectList } from './project-list'

const meta = {
  title: 'Features/Projects/Components/Project List',
  component: ProjectList,
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
    expandedProjectIds: new Set([projectSidebarProjects[0].id]),
    sessionsByProjectId: projectSidebarSessionsByProjectId,
    activeSessionId: projectSidebarSessions[0].id,
    ...projectSidebarCallbacks
  }
} satisfies Meta<typeof ProjectList>

export default meta

type Story = StoryObj<typeof meta>

export const WithExpandedProject: Story = {}

export const Loading: Story = {
  args: { status: 'loading' }
}

export const Error: Story = {
  args: {
    status: 'error',
    error: 'Could not reach the local project store.'
  }
}

export const Empty: Story = {
  args: {
    projects: [],
    activeProject: null,
    expandedProjectIds: new Set(),
    sessionsByProjectId: new Map()
  }
}
