import { Reasoning, ReasoningContent, ReasoningTrigger } from '@renderer/components/ui/reasoning'
import { cn } from '@renderer/lib/utils'

import type { AiChatThinkingPart } from './ai-chat.types'

export type ChatThinkingBlockProps = {
  part: AiChatThinkingPart
  className?: string
}

export function ChatThinkingBlock({ part, className }: ChatThinkingBlockProps) {
  const isStreaming = part.state === 'streaming'

  return (
    <Reasoning
      className={cn('rounded-md border border-border/70 bg-muted/30 p-3', className)}
      defaultOpen={part.collapsed === false}
      isStreaming={isStreaming}
    >
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  )
}
