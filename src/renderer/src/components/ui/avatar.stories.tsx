import type { Meta, StoryObj } from '@storybook/react-vite'

import { Avatar, AvatarFallback } from './avatar'

const meta = {
  title: 'Design System/Primitives/Avatar',
  component: Avatar,
  render: () => (
    <Avatar>
      <AvatarFallback>SZ</AvatarFallback>
    </Avatar>
  )
} satisfies Meta<typeof Avatar>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
