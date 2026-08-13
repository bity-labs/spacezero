import type { Meta, StoryObj } from '@storybook/react-vite'

import { ProjectSidebarList } from './project-sidebar-list'

const meta = {
  title: 'Smoke/Project Sidebar List',
  component: ProjectSidebarList,
  decorators: [
    (Story) => (
      <div className="w-64 rounded-lg border border-sidebar-border bg-sidebar py-3 text-sidebar-foreground">
        <Story />
      </div>
    )
  ],
  args: {
    projects: [],
    activeProject: null,
    status: 'ready',
    error: null,
    onAddProject: () => undefined,
    onSelectProject: () => undefined,
    onEditProject: () => undefined
  }
} satisfies Meta<typeof ProjectSidebarList>

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {}
