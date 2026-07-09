import * as React from 'react'

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
    <div className={cn('space-y-1 overflow-y-auto', className)} aria-label="Conversation">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onResolveToolConfirmation={onResolveToolConfirmation}
        />
      ))}
    </div>
  )
}

export const ChatConversation = ChatTranscript
export type ChatConversationProps = ChatTranscriptProps
