import type { Meta, StoryObj } from '@storybook/react-vite'

import { SettingsPageHeader } from './settings-page-header'

const meta = {
  title: 'Settings/Building Blocks/Page Header',
  component: SettingsPageHeader,
  decorators: [
    (Story) => (
      <div className="w-[40rem] max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    )
  ],
  args: {
    title: 'General',
    description: 'Choose how Space Zero behaves across your workspace.'
  }
} satisfies Meta<typeof SettingsPageHeader>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
