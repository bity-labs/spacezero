import type { Meta, StoryObj } from '@storybook/react-vite'

import { Switch } from './switch'

const meta = {
  title: 'Design System/Primitives/Switch',
  component: Switch,
  args: {
    'aria-label': 'Enable automatic updates',
    defaultChecked: true
  }
} satisfies Meta<typeof Switch>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
