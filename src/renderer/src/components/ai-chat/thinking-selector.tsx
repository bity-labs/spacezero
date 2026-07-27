import { Brain } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'

import type { AiChatThinkingLevel } from './ai-chat.types'

export type ThinkingSelectorProps = {
  value: AiChatThinkingLevel
  availableLevels?: readonly AiChatThinkingLevel[]
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
  'xhigh',
  'max'
]

const thinkingLevelLabels: Record<AiChatThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'X-High',
  max: 'Max'
}

export function ThinkingSelector({
  value,
  availableLevels = thinkingLevels,
  disabled = false,
  onChange,
  className
}: ThinkingSelectorProps) {
  const handleClick = () => {
    onChange(getNextThinkingLevel(value, availableLevels))
  }

  return (
    <Button
      aria-label={`Thinking: ${thinkingLevelLabels[value]}`}
      className={className}
      disabled={disabled}
      onClick={handleClick}
      size="xs"
      type="button"
      variant="ghost"
    >
      <Brain className="size-3" aria-hidden="true" />
      <span>{thinkingLevelLabels[value]}</span>
    </Button>
  )
}

export function getNextThinkingLevel(
  value: AiChatThinkingLevel,
  availableLevels: readonly AiChatThinkingLevel[] = thinkingLevels
): AiChatThinkingLevel {
  const levels = availableLevels.length > 0 ? availableLevels : thinkingLevels
  const currentIndex = levels.indexOf(value)
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % levels.length

  return levels[nextIndex]
}
