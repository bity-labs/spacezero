import { memo, type ReactNode } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationItem,
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
  onOpenLink?: (url: string) => void | Promise<void>
}

export function ChatTranscript({
  messages,
  emptyState,
  className,
  contentClassName,
  onToolConfirmationResolve,
  onOpenLink
}: ChatTranscriptProps) {
  return (
    <Conversation className={cn('min-h-0', className)}>
      <ConversationContent className={contentClassName}>
        {messages.length === 0
          ? (emptyState ?? <ConversationEmptyState />)
          : messages.map((message) => (
              <ConversationItem key={message.id} messageId={message.id} scrollAnchor>
                <ChatTranscriptMessage
                  message={message}
                  onToolConfirmationResolve={onToolConfirmationResolve}
                  onOpenLink={onOpenLink}
                />
              </ConversationItem>
            ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}

const ChatTranscriptMessage = memo(function ChatTranscriptMessage({
  message,
  onToolConfirmationResolve,
  onOpenLink
}: {
  message: AiChatMessage
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
  onOpenLink?: (url: string) => void | Promise<void>
}) {
  return (
    <ChatMessage
      message={message}
      onToolConfirmationResolve={onToolConfirmationResolve}
      onOpenLink={onOpenLink}
    />
  )
})
