import { FolderOpenIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { EmptyState } from './empty'

const meta = {
  title: 'Design System/Primitives/Empty',
  component: EmptyState,
  args: {
    icon: <FolderOpenIcon />,
    title: 'No projects yet',
    description: 'Add a project to start building.',
    actions: <Button size="sm">Add project</Button>
  }
} satisfies Meta<typeof EmptyState>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
