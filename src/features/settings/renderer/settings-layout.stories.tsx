import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  aboutSettingsLayoutFixture,
  appearanceSettingsLayoutFixture,
  generalSettingsLayoutFixture,
  githubAccountSettingsLayoutFixture,
  modelsSettingsLayoutFixture,
  narrowSettingsLayoutFixture,
  wideSettingsLayoutFixture
} from './settings-layout.fixtures'
import { SettingsLayoutView } from './settings-layout-view'

const meta = {
  title: 'Features/Settings/Layouts/Settings Shell',
  component: SettingsLayoutView,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    selectedSection: {
      control: 'select',
      options: ['general', 'models', 'account', 'appearance', 'about', 'agents', 'skills']
    },
    sidebarWidth: {
      control: { type: 'range', min: 220, max: 340, step: 10 }
    }
  },
  args: generalSettingsLayoutFixture
} satisfies Meta<typeof SettingsLayoutView>

export default meta

type Story = StoryObj<typeof meta>

export const GeneralSelected: Story = {}

export const ModelsSelected: Story = {
  args: modelsSettingsLayoutFixture
}

export const AccountSelected: Story = {
  args: githubAccountSettingsLayoutFixture
}

export const AppearanceSelected: Story = {
  args: appearanceSettingsLayoutFixture
}

export const AboutSelected: Story = {
  args: aboutSettingsLayoutFixture
}

export const NarrowSidebar: Story = {
  args: narrowSettingsLayoutFixture
}

export const WideSidebar: Story = {
  args: wideSettingsLayoutFixture
}

export const General = GeneralSelected

export const Models = ModelsSelected

export const GitHubAccount = AccountSelected
