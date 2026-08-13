import type { Meta, StoryObj } from '@storybook/react-vite'

import { Textarea } from './textarea'

const meta = {
  title: 'Design System/Primitives/Textarea',
  component: Textarea,
  args: {
    className: 'w-80',
    placeholder: 'Add session instructions...'
  }
} satisfies Meta<typeof Textarea>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
