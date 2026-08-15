import { Archive, Trash } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { ProjectItemActionButton } from './project-item-action-button'

const meta = {
  title: 'Features/Projects/Components/Project Item Action Button',
  component: ProjectItemActionButton,
  decorators: [
    (Story) => (
      <div className="w-32 rounded-lg border border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
        <Story />
      </div>
    )
  ],
  args: {
    label: 'Archive project',
    icon: Archive,
    onClick: () => undefined
  }
} satisfies Meta<typeof ProjectItemActionButton>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Destructive: Story = {
  args: {
    label: 'Delete project',
    icon: Trash,
    destructive: true
  }
}
