import * as React from 'react'

import { cn } from '@renderer/lib/utils'

export const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

export type ThinkingLevel = (typeof thinkingLevels)[number]

export type SessionThinkingSelectorProps = {
  selectedLevel: ThinkingLevel
  onThinkingChange: (level: ThinkingLevel) => void
  disabled?: boolean
  className?: string
}

export function SessionThinkingSelector({
  selectedLevel,
  onThinkingChange,
  disabled = false,
  className
}: SessionThinkingSelectorProps): React.JSX.Element {
  return (
    <label className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="text-muted-foreground">Thinking</span>
      <select
        aria-label="Session thinking level"
        value={selectedLevel}
        disabled={disabled}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => onThinkingChange(event.target.value as ThinkingLevel)}
      >
        {thinkingLevels.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </select>
    </label>
  )
}
