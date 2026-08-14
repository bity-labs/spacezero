import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  unavailableErrorKnowledgeBaseFixture,
  unavailableKnowledgeBaseFixture
} from './knowledge-base-unavailable-screen.fixtures'
import { KnowledgeBaseUnavailableScreen } from './knowledge-base-unavailable-screen'

const meta = {
  title: 'Features/Knowledge Base/Screens/Unavailable',
  component: KnowledgeBaseUnavailableScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-screen min-h-[640px] bg-background">
        <Story />
      </div>
    )
  ],
  args: unavailableKnowledgeBaseFixture
} satisfies Meta<typeof KnowledgeBaseUnavailableScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Unavailable: Story = {}

export const Error: Story = {
  args: unavailableErrorKnowledgeBaseFixture
}
