import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '@renderer/components/ui/button'

const meta = {
  title: 'Smoke/Button',
  component: Button,
  args: {
    children: 'Storybook is ready'
  }
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
