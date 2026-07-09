import * as React from 'react'

import { cn } from '@renderer/lib/utils'

import { ChatMessage, type ChatMessageData } from './chat-message'

export type ChatConversationProps = {
  messages: ChatMessageData[]
  streamingMessageId?: string
  isStreaming?: boolean
  className?: string
}

export function ChatConversation({
  messages,
  streamingMessageId,
  isStreaming = false,
  className
}: ChatConversationProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1 overflow-y-auto', className)} aria-label="Conversation">
      {messages.map((message) => {
        const isActiveStream = isStreaming && message.id === streamingMessageId

        return <ChatMessage key={message.id} message={message} isStreaming={isActiveStream} />
      })}
    </div>
  )
}
