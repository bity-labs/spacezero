import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  cloneFromRepositoryKnowledgeBaseFixture,
  cloningKnowledgeBaseFixture,
  createNewKnowledgeBaseFixture,
  creatingKnowledgeBaseFixture,
  loadingKnowledgeBaseFixture,
  notConfiguredKnowledgeBaseFixture,
  setupErrorKnowledgeBaseFixture
} from './knowledge-base-setup-screen.fixtures'
import { KnowledgeBaseSetupScreen } from './knowledge-base-setup-screen'

const meta = {
  title: 'Screens/Knowledge Base/Setup',
  component: KnowledgeBaseSetupScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen min-h-[640px] bg-background">
        <Story />
      </div>
    )
  ],
  args: notConfiguredKnowledgeBaseFixture
} satisfies Meta<typeof KnowledgeBaseSetupScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Loading: Story = {
  args: loadingKnowledgeBaseFixture
}

export const NotConfigured: Story = {}

export const CreateNew: Story = {
  args: createNewKnowledgeBaseFixture
}

export const CloneFromRepository: Story = {
  args: cloneFromRepositoryKnowledgeBaseFixture
}

export const Creating: Story = {
  args: creatingKnowledgeBaseFixture
}

export const Cloning: Story = {
  args: cloningKnowledgeBaseFixture
}

export const Error: Story = {
  args: setupErrorKnowledgeBaseFixture
}
