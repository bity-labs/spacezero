import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  connectedAccountMenuFixture,
  disconnectedAccountMenuFixture,
  updateReadyAccountMenuFixture
} from './account-menu-view.fixtures'
import { AccountMenuView } from './account-menu-view'

const meta = {
  title: 'Design System/Components/App Shell/Account Menu',
  component: AccountMenuView,
  decorators: [
    (Story) => (
      <div className="w-72 rounded-lg border bg-sidebar p-2 text-sidebar-foreground">
        <Story />
      </div>
    )
  ],
  args: connectedAccountMenuFixture
} satisfies Meta<typeof AccountMenuView>

export default meta

type Story = StoryObj<typeof meta>

export const Connected: Story = {}

export const Disconnected: Story = {
  args: disconnectedAccountMenuFixture
}

export const UpdateReady: Story = {
  args: updateReadyAccountMenuFixture
}
