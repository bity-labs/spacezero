import * as React from 'react'

import { cn } from '@renderer/lib/utils'

export type ChatMessageRole = 'user' | 'assistant'

export type ChatReasoningBlock = {
  id: string
  content: string
  label?: string
}

export type ChatMessageData = {
  id: string
  role: ChatMessageRole
  content: string
  reasoning?: ChatReasoningBlock[]
}

export type ChatMessageProps = {
  message: ChatMessageData
  className?: string
}

export function ChatMessage({ message, className }: ChatMessageProps): React.JSX.Element {
  const isUser = message.role === 'user'

  return (
    <article
      data-testid={`chat-message-${message.id}`}
      data-role={message.role}
      className={cn('flex w-full gap-3 py-3', isUser ? 'justify-end' : 'justify-start', className)}
    >
      <div className={cn('max-w-[78%] space-y-2', isUser && 'items-end')}>
        <div className={cn('text-xs font-medium text-muted-foreground', isUser && 'text-right')}>
          {isUser ? 'You' : 'Assistant'}
        </div>

        {!isUser && message.reasoning?.length ? (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="text-xs font-semibold uppercase tracking-wide">Thinking</div>
            {message.reasoning.map((block) => (
              <div key={block.id} className="whitespace-pre-wrap leading-relaxed">
                {block.label ? <span className="font-medium">{block.label}: </span> : null}
                {block.content}
              </div>
            ))}
          </div>
        ) : null}

        <div
          className={cn(
            'whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-xs',
            isUser ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-card-foreground'
          )}
        >
          {message.content}
        </div>
      </div>
    </article>
  )
}
