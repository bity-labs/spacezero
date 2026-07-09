import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import {
  ModelSelector as ModelSelectorPrimitive,
  ModelSelectorContent,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorTrigger
} from '@renderer/components/ui/model-selector'

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
    <ModelSelectorPrimitive open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={
          <Button
            className={className}
            type="button"
            variant="outline"
            size="sm"
            aria-label="Session thinking level"
            disabled={disabled}
          />
        }
      >
        <span className="text-muted-foreground">Thinking</span>
        <span>{value}</span>
        <CaretDownIcon />
      </ModelSelectorTrigger>

      <ModelSelectorContent title="Session thinking level" className="max-w-48">
        <ModelSelectorList>
          {thinkingLevels.map((level) => (
            <ModelSelectorItem
              key={level}
              value={level}
              onSelect={() => {
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
    </ModelSelectorPrimitive>
  )
}

export const SessionThinkingSelector = ThinkingSelector
export type SessionThinkingSelectorProps = ThinkingSelectorProps
