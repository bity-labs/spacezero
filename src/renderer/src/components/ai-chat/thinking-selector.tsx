import { Brain } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'

import type { AiChatThinkingLevel } from './ai-chat.types'

export type ThinkingSelectorProps = {
  value: AiChatThinkingLevel
  disabled?: boolean
  onChange: (value: AiChatThinkingLevel) => void
  className?: string
}

const thinkingLevels: readonly AiChatThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh'
]

const thinkingLevelLabels: Record<AiChatThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High'
}

export function ThinkingSelector({ value, disabled = false, onChange, className }: ThinkingSelectorProps) {
  const handleClick = () => {
    onChange(getNextThinkingLevel(value))
  }

  return (
    <Button
      aria-label={`Thinking: ${thinkingLevelLabels[value]}`}
      className={className}
      disabled={disabled}
      onClick={handleClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Brain className="size-4" aria-hidden="true" />
      <span>{thinkingLevelLabels[value]}</span>
    </Button>
  )
}

export function getNextThinkingLevel(value: AiChatThinkingLevel): AiChatThinkingLevel {
  const currentIndex = thinkingLevels.indexOf(value)
  const nextIndex = (currentIndex + 1) % thinkingLevels.length

  return thinkingLevels[nextIndex]
}
