import * as React from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton
} from '@renderer/components/ui/conversation'
import { cn } from '@renderer/lib/utils'

import { ChatMessage } from './chat-message'
import type { AiChatMessage } from './types'

export type ChatTranscriptProps = {
  messages: AiChatMessage[]
  onResolveToolConfirmation?: (callId: string, approved: boolean) => void
  className?: string
}

export function ChatTranscript({
  messages,
  onResolveToolConfirmation,
  className
}: ChatTranscriptProps): React.JSX.Element {
  return (
    <Conversation className={cn(className)} aria-label="Conversation">
      <ConversationContent className="gap-1 p-0">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onResolveToolConfirmation={onResolveToolConfirmation}
          />
        ))}
      </ConversationContent>
      <ConversationScrollButton aria-label="Scroll to bottom" />
    </Conversation>
  )
}

export const ChatConversation = ChatTranscript
export type ChatConversationProps = ChatTranscriptProps
