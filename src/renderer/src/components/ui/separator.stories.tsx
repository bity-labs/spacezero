import type { Meta, StoryObj } from '@storybook/react-vite'

import { Separator } from './separator'

const meta = {
  title: 'Design System/Primitives/Separator',
  component: Separator,
  render: () => (
    <div className="w-80 space-y-3 text-sm">
      <div>Workspace</div>
      <Separator />
      <div>Recent sessions</div>
    </div>
  )
} satisfies Meta<typeof Separator>

export default meta

type Story = StoryObj<typeof meta>

export const Horizontal: Story = {}
