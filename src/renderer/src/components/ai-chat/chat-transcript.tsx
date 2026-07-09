import { memo, type ReactNode } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@renderer/components/ui/conversation'
import { cn } from '@renderer/lib/utils'

import type { AiChatMessage } from './ai-chat.types'
import { ChatMessage } from './chat-message'

export type ChatTranscriptProps = {
  messages: readonly AiChatMessage[]
  emptyState?: ReactNode
  className?: string
  contentClassName?: string
}

export function ChatTranscript({
  messages,
  emptyState,
  className,
  contentClassName
}: ChatTranscriptProps) {
  return (
    <Conversation className={cn('min-h-0', className)}>
      <ConversationContent className={contentClassName}>
        {messages.length === 0
          ? (emptyState ?? <ConversationEmptyState />)
          : messages.map((message) => <ChatTranscriptMessage key={message.id} message={message} />)}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

const ChatTranscriptMessage = memo(function ChatTranscriptMessage({
  message
}: {
  message: AiChatMessage
}) {
  return <ChatMessage message={message} />
})
