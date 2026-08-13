import type { Meta, StoryObj } from '@storybook/react-vite'

import { Input } from './input'

const meta = {
  title: 'Design System/Primitives/Input',
  component: Input,
  args: {
    className: 'w-80',
    placeholder: 'Project name'
  }
} satisfies Meta<typeof Input>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
