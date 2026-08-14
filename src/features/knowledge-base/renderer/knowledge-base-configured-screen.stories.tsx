import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  configuredKnowledgeBaseFixture,
  configuredWarningKnowledgeBaseFixture
} from './knowledge-base-configured-screen.fixtures'
import { KnowledgeBaseConfiguredScreen } from './knowledge-base-configured-screen'

const meta = {
  title: 'Features/Knowledge Base/Screens/Configured',
  component: KnowledgeBaseConfiguredScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen min-h-[720px] bg-background">
        <Story />
      </div>
    )
  ],
  args: configuredKnowledgeBaseFixture
} satisfies Meta<typeof KnowledgeBaseConfiguredScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Normal: Story = {}

export const Warning: Story = {
  args: configuredWarningKnowledgeBaseFixture
}
