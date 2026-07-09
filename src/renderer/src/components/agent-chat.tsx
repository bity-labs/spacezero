import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@renderer/components/ui/conversation'
import { Message, MessageContent } from '@renderer/components/ui/message'
import { cn } from '@renderer/lib/utils'

export type AgentChatMessageRole = UIMessage['role']

export type AgentChatMessage = {
  id: string
  role: AgentChatMessageRole
  content: ReactNode
}

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
            : messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>{message.content}</MessageContent>
                </Message>
              ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {composer ? <div className="border-t p-4">{composer}</div> : null}
    </section>
  )
}
