import type { Meta, StoryObj } from '@storybook/react-vite'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

const meta = {
  title: 'Design System/Primitives/Select',
  component: Select,
  render: () => (
    <Select defaultValue="sonnet">
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="sonnet">Claude Sonnet</SelectItem>
        <SelectItem value="gpt">GPT</SelectItem>
      </SelectContent>
    </Select>
  )
} satisfies Meta<typeof Select>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
