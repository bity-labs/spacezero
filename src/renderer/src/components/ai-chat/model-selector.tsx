import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import {
  ModelSelectorContent,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorRoot,
  ModelSelectorTrigger
} from './elements/model-selector'
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
    <ModelSelectorRoot className={className}>
      <ModelSelectorTrigger
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
      </ModelSelectorTrigger>

      {open ? (
        <ModelSelectorContent>
          <ModelSelectorList aria-label="Session model">
            {models.map((model) => (
              <ModelSelectorItem
                key={model.id}
                type="button"
                role="option"
                aria-selected={model.id === selectedModelId}
                disabled={model.disabled}
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
              </ModelSelectorItem>
            ))}
          </ModelSelectorList>
        </ModelSelectorContent>
      ) : null}
    </ModelSelectorRoot>
  )
}

export const SessionModelSelector = ModelSelector
export type SessionModelSelectorProps = ModelSelectorProps
