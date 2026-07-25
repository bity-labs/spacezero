import { Message, MessageContent, MessageResponse } from '@renderer/components/ui/message'
import { cn } from '@renderer/lib/utils'

import type { AiChatMessage, AiChatMessagePart } from './ai-chat.types'
import { ChatThinkingBlock } from './chat-thinking-block'
import { ToolCallBlock } from './tool-call-block'
import { ToolConfirmationCard } from './tool-confirmation-card'

export type ChatMessageProps = {
  message: AiChatMessage
  className?: string
  onToolConfirmationResolve?: (callId: string, approved: boolean) => void
  onOpenLink?: (url: string) => void | Promise<void>
}

export function ChatMessage({
  message,
  className,
  onToolConfirmationResolve = noopToolConfirmationResolve,
  onOpenLink
}: ChatMessageProps) {
  return (
    <Message
      className={cn(message.status === 'error' && 'text-destructive', className)}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) =>
          renderPart(part, index, onToolConfirmationResolve, onOpenLink)
        )}
      </MessageContent>
    </Message>
  )
}

function renderPart(
  part: AiChatMessagePart,
  index: number,
  onToolConfirmationResolve: (callId: string, approved: boolean) => void,
  onOpenLink: ((url: string) => void | Promise<void>) | undefined
) {
  switch (part.type) {
    case 'text':
      return (
        <MessageResponse
          key={index}
          components={
            onOpenLink
              ? {
                  a: ({ href, children, ...props }) => (
                    <a
                      {...props}
                      href={href}
                      onClick={(event) => {
                        if (!href || !isHttpChatLink(href)) {
                          event.preventDefault()
                          return
                        }
                        event.preventDefault()
                        void onOpenLink(href)
                      }}
                    >
                      {children}
                    </a>
                  )
                }
              : undefined
          }
        >
          {part.text}
        </MessageResponse>
      )
    case 'thinking':
      return <ChatThinkingBlock key={index} part={part} />
    case 'tool-call':
      return <ToolCallBlock key={index} {...part} />
    case 'tool-confirmation':
      return (
        <ToolConfirmationCard
          key={index}
          {...part}
          onResolve={onToolConfirmationResolve}
        />
      )
  }
}

function noopToolConfirmationResolve() {}

function isHttpChatLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
