import type { Meta, StoryObj } from '@storybook/react-vite'

import { Shimmer } from './shimmer'

const meta = {
  title: 'Design System/Primitives/Shimmer',
  component: Shimmer,
  args: {
    children: 'Thinking...'
  }
} satisfies Meta<typeof Shimmer>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
