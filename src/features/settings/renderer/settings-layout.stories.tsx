import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  generalSettingsLayoutFixture,
  githubAccountSettingsLayoutFixture,
  modelsSettingsLayoutFixture
} from './settings-layout.fixtures'
import { SettingsLayoutView } from './settings-layout-view'

const meta = {
  title: 'Layouts/Settings',
  component: SettingsLayoutView,
  parameters: { layout: 'fullscreen' },
  args: generalSettingsLayoutFixture
} satisfies Meta<typeof SettingsLayoutView>

export default meta

type Story = StoryObj<typeof meta>

export const General: Story = {}

export const Models: Story = {
  args: modelsSettingsLayoutFixture
}

export const GitHubAccount: Story = {
  args: githubAccountSettingsLayoutFixture
}
