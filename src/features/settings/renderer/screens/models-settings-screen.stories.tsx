import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  apiKeyDialogModelsSettingsFixture,
  connectedModelsSettingsFixture,
  defaultModelPickerModelsSettingsFixture,
  emptyModelsSettingsFixture,
  errorModelsSettingsFixture,
  loadingModelsSettingsFixture,
  providerPickerModelsSettingsFixture
} from './models-settings-screen.fixtures'
import { ModelsSettingsScreen } from './models-settings-screen'

const meta = {
  title: 'Features/Settings/Screens/Models',
  component: ModelsSettingsScreen,
  decorators: [
    (Story) => (
      <div className="w-[746px] max-w-[calc(100vw-2rem)] py-8">
        <Story />
      </div>
    )
  ],
  args: connectedModelsSettingsFixture
} satisfies Meta<typeof ModelsSettingsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
  args: loadingModelsSettingsFixture
}

export const Empty: Story = {
  args: emptyModelsSettingsFixture
}

export const Error: Story = {
  args: errorModelsSettingsFixture
}

export const Connected: Story = {}

export const ProviderPicker: Story = {
  args: providerPickerModelsSettingsFixture
}

export const ApiKeyDialog: Story = {
  args: apiKeyDialogModelsSettingsFixture
}

export const DefaultModelPicker: Story = {
  args: defaultModelPickerModelsSettingsFixture
}
