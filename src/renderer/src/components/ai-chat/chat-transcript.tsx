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
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
}

export function ChatTranscript({
  messages,
  emptyState,
  className,
  contentClassName,
  onToolConfirmationResolve
}: ChatTranscriptProps) {
  return (
    <Conversation className={cn('min-h-0', className)}>
      <ConversationContent className={contentClassName}>
        {messages.length === 0
          ? (emptyState ?? <ConversationEmptyState />)
          : messages.map((message) => (
              <ChatTranscriptMessage
                key={message.id}
                message={message}
                onToolConfirmationResolve={onToolConfirmationResolve}
              />
            ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

const ChatTranscriptMessage = memo(function ChatTranscriptMessage({
  message,
  onToolConfirmationResolve
}: {
  message: AiChatMessage
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
}) {
  return <ChatMessage message={message} onToolConfirmationResolve={onToolConfirmationResolve} />
})
