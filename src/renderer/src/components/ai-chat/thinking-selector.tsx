// Uses the AI Elements model-selector interaction pattern for Space Zero thinking levels.
import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

import { type ThinkingLevel, thinkingLevels } from './types'

export type ThinkingSelectorProps = {
  value: ThinkingLevel
  disabled?: boolean
  onChange: (value: ThinkingLevel) => void
  className?: string
}

export function ThinkingSelector({
  value,
  disabled = false,
  onChange,
  className
}: ThinkingSelectorProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={cn('relative inline-block text-sm', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Session thinking level"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-muted-foreground">Thinking</span>
        <span>{value}</span>
        <CaretDownIcon />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-2 w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div role="listbox" aria-label="Session thinking level">
            {thinkingLevels.map((level) => (
              <button
                key={level}
                type="button"
                role="option"
                aria-selected={level === value}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  onChange(level)
                  setOpen(false)
                }}
              >
                <span className="size-4">{level === value ? <CheckIcon /> : null}</span>
                {level}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const SessionThinkingSelector = ThinkingSelector
export type SessionThinkingSelectorProps = ThinkingSelectorProps
