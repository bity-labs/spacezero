import { Message, MessageContent, MessageResponse } from '@renderer/components/ui/message'
import { cn } from '@renderer/lib/utils'

import type { AiChatMessage, AiChatMessagePart } from './ai-chat.types'
import { ChatThinkingBlock } from './chat-thinking-block'

export type ChatMessageProps = {
  message: AiChatMessage
  className?: string
}

export function ChatMessage({ message, className }: ChatMessageProps) {
  return (
    <Message
      className={cn(message.status === 'error' && 'text-destructive', className)}
      from={message.role}
    >
      <MessageContent>{message.parts.map((part, index) => renderPart(part, index))}</MessageContent>
    </Message>
  )
}

function renderPart(part: AiChatMessagePart, index: number) {
  switch (part.type) {
    case 'text':
      return <MessageResponse key={index}>{part.text}</MessageResponse>
    case 'thinking':
      return <ChatThinkingBlock key={index} part={part} />
  }
}
