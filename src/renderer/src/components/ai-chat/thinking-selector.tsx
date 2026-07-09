import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import {
  ModelSelectorContent,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorRoot,
  ModelSelectorTrigger
} from './elements/model-selector'
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
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return undefined

    function closeOnOutsidePointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
  }, [open])

  return (
    <ModelSelectorRoot ref={rootRef} className={className}>
      <ModelSelectorTrigger
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
      </ModelSelectorTrigger>

      {open ? (
        <ModelSelectorContent className="w-40">
          <ModelSelectorList aria-label="Session thinking level">
            {thinkingLevels.map((level) => (
              <ModelSelectorItem
                key={level}
                type="button"
                role="option"
                aria-selected={level === value}
                className="items-center py-1.5"
                onClick={() => {
                  onChange(level)
                  setOpen(false)
                }}
              >
                <span className="size-4">{level === value ? <CheckIcon /> : null}</span>
                {level}
              </ModelSelectorItem>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      ) : null}
    </ModelSelectorRoot>
  )
}

export const SessionThinkingSelector = ThinkingSelector
export type SessionThinkingSelectorProps = ThinkingSelectorProps
