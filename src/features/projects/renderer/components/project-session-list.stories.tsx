import type { Meta, StoryObj } from '@storybook/react-vite'

import { SidebarProvider } from '@renderer/components/ui/sidebar'

import {
  projectSidebarCallbacks,
  projectSidebarProjects,
  projectSidebarSessions
} from './project-sidebar.fixtures'
import { ProjectSessionList } from './project-session-list'

const meta = {
  title: 'Features/Projects/Components/Project Session List',
  component: ProjectSessionList,
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
    project: projectSidebarProjects[0],
    sessions: projectSidebarSessions,
    activeSessionId: projectSidebarSessions[0].id,
    ...projectSidebarCallbacks
  }
} satisfies Meta<typeof ProjectSessionList>

export default meta

type Story = StoryObj<typeof meta>

export const WithSessions: Story = {}

export const Empty: Story = {
  args: {
    sessions: []
  }
}

export const Loading: Story = {
  args: {
    status: 'loading'
  }
}

export const Error: Story = {
  args: {
    status: 'error',
    error: 'Could not load sessions.'
  }
}
