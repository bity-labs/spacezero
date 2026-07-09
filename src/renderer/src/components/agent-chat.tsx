import type { ReactNode } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@renderer/components/ui/conversation'
import { ChatMessage, type AiChatMessage } from '@renderer/components/ai-chat'
import { cn } from '@renderer/lib/utils'

export type AgentChatMessage = AiChatMessage

export type AgentChatProps = {
  messages: AgentChatMessage[]
  composer?: ReactNode
  emptyState?: ReactNode
  className?: string
  contentClassName?: string
}

export function AgentChat({
  messages,
  composer,
  emptyState,
  className,
  contentClassName
}: AgentChatProps) {
  return (
    <section className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <Conversation>
        <ConversationContent className={contentClassName}>
          {messages.length === 0
            ? (emptyState ?? <ConversationEmptyState />)
            : messages.map((message) => <ChatMessage key={message.id} message={message} />)}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {composer ? <div className="border-t p-4">{composer}</div> : null}
    </section>
  )
}
