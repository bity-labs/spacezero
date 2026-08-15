import type { Meta, StoryObj } from '@storybook/react-vite'

import { SidebarProvider } from '@renderer/components/ui/sidebar'

import { projectSidebarCallbacks, projectSidebarSessions } from './project-sidebar.fixtures'
import { ProjectSessionItem } from './project-session-item'

const meta = {
  title: 'Features/Projects/Components/Project Session Item',
  component: ProjectSessionItem,
  decorators: [
    (Story) => (
      <SidebarProvider>
        <div className="w-64 rounded-lg border border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
          <Story />
        </div>
      </SidebarProvider>
    )
  ],
  args: {
    session: projectSidebarSessions[0],
    active: true,
    onSelectSession: projectSidebarCallbacks.onSelectSession,
    onArchiveSession: projectSidebarCallbacks.onArchiveSession
  }
} satisfies Meta<typeof ProjectSessionItem>

export default meta

type Story = StoryObj<typeof meta>

export const ActiveRunning: Story = {}

export const Idle: Story = {
  args: {
    session: projectSidebarSessions[1],
    active: false
  }
}

export const Success: Story = {
  args: {
    session: projectSidebarSessions[2],
    active: false
  }
}

export const Failed: Story = {
  args: {
    session: projectSidebarSessions[3],
    active: false
  }
}

export const AllStates: Story = {
  render: () => (
    <div className="space-y-1">
      {projectSidebarSessions.map((session, index) => (
        <ProjectSessionItem
          key={session.id}
          session={session}
          active={index === 0}
          onSelectSession={projectSidebarCallbacks.onSelectSession}
          onArchiveSession={projectSidebarCallbacks.onArchiveSession}
        />
      ))}
    </div>
  )
}
