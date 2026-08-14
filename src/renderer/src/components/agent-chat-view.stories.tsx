import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  confirmationRequiredFixture,
  emptyChatFixture,
  errorStateFixture,
  normalTranscriptFixture,
  streamingResponseFixture,
  thinkingVisibleFixture,
  toolCallCompletedFixture,
  toolCallFailedFixture,
  toolCallRunningFixture
} from './agent-chat-view.fixtures'
import { AgentChatView } from './agent-chat-view'

const noOp = (): void => undefined

const meta = {
  title: 'Chat/Building Blocks/Agent Chat',
  component: AgentChatView,
  decorators: [
    (Story) => (
      <div className="flex h-[720px] w-[900px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-sm">
        <Story />
      </div>
    )
  ],
  args: {
    ...emptyChatFixture,
    onSubmit: noOp,
    onAbort: noOp,
    onModelChange: noOp,
    onThinkingChange: noOp,
    onAgentDefinitionChange: noOp,
    onToolConfirmationResolve: noOp,
    onOpenLink: noOp
  }
} satisfies Meta<typeof AgentChatView>

export default meta

type Story = StoryObj<typeof meta>

export const EmptyChat: Story = {
  args: emptyChatFixture
}

export const NormalTranscript: Story = {
  args: normalTranscriptFixture
}

export const StreamingResponse: Story = {
  args: streamingResponseFixture
}

export const ThinkingVisible: Story = {
  args: thinkingVisibleFixture
}

export const ToolCallRunning: Story = {
  args: toolCallRunningFixture
}

export const ToolCallCompleted: Story = {
  args: toolCallCompletedFixture
}

export const ToolCallFailed: Story = {
  args: toolCallFailedFixture
}

export const ConfirmationRequired: Story = {
  args: confirmationRequiredFixture
}

export const ErrorState: Story = {
  args: errorStateFixture
}
