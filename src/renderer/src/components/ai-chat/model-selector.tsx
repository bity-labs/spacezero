// Adapted from AI Elements model-selector for Space Zero-owned model options.
import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

import type { AiChatModelOption } from './types'

export type ModelSelectorProps = {
  models: AiChatModelOption[]
  selectedModelId?: string
  disabled?: boolean
  loading?: boolean
  onSelect: (model: AiChatModelOption) => void
  className?: string
}

export function ModelSelector({
  models,
  selectedModelId,
  disabled = false,
  loading = false,
  onSelect,
  className
}: ModelSelectorProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const selected = models.find((model) => model.id === selectedModelId)
  const isDisabled = disabled || loading || models.length === 0

  return (
    <div className={cn('relative inline-block text-sm', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Session model"
        disabled={isDisabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-muted-foreground">Model</span>
        <span>{loading ? 'Loading…' : selected?.label ?? (models.length ? 'Select model' : 'No models available')}</span>
        <CaretDownIcon />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-2 w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <div role="listbox" aria-label="Session model" className="max-h-72 overflow-y-auto">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={model.id === selectedModelId}
                disabled={model.disabled}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onSelect(model)
                  setOpen(false)
                }}
              >
                <span className="mt-0.5 size-4">{model.id === selectedModelId ? <CheckIcon /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{model.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {model.provider} · {model.modelId}
                    {model.description ? ` — ${model.description}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const SessionModelSelector = ModelSelector
export type SessionModelSelectorProps = ModelSelectorProps
