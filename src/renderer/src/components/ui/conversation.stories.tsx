import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Conversation,
  ConversationContent,
  ConversationItem,
  ConversationScrollButton
} from './conversation'
import { Message, MessageContent } from './message'

const meta = {
  title: 'Design System/Components/Agent Chat/Conversation',
  component: Conversation,
  render: () => (
    <Conversation className="h-80 w-[32rem] rounded-md border">
      <ConversationContent>
        <ConversationItem>
          <Message from="user">
            <MessageContent>Show the current project status.</MessageContent>
          </Message>
        </ConversationItem>
        <ConversationItem>
          <Message from="assistant">
            <MessageContent>The project is ready and all checks pass.</MessageContent>
          </Message>
        </ConversationItem>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
} satisfies Meta<typeof Conversation>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
