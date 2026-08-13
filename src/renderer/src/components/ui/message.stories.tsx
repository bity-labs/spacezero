import { CopyIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from './message'

const meta = {
  title: 'Design System/Primitives/Message',
  component: Message,
  args: {
    from: 'assistant'
  },
  render: () => (
    <div className="w-[32rem] space-y-4">
      <Message from="user">
        <MessageContent>What is the current project status?</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>The project is **ready** and all checks pass.</MessageResponse>
        </MessageContent>
        <MessageActions>
          <MessageAction label="Copy">
            <CopyIcon />
          </MessageAction>
        </MessageActions>
      </Message>
    </div>
  )
} satisfies Meta<typeof Message>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
