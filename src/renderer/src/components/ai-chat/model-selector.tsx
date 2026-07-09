import * as React from 'react'
import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import {
  ModelSelector as ModelSelectorPrimitive,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger
} from '@renderer/components/ui/model-selector'

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
    <ModelSelectorPrimitive open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger
        render={
          <Button
            className={className}
            type="button"
            variant="outline"
            size="sm"
            aria-label="Session model"
            disabled={isDisabled}
          />
        }
      >
        <span className="text-muted-foreground">Model</span>
        <span>{loading ? 'Loading…' : selected?.label ?? (models.length ? 'Select model' : 'No models available')}</span>
        <CaretDownIcon />
      </ModelSelectorTrigger>

      <ModelSelectorContent title="Session model">
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {models.map((model) => (
            <ModelSelectorItem
              key={model.id}
              value={`${model.provider} ${model.label} ${model.modelId}`}
              disabled={model.disabled}
              onSelect={() => {
                onSelect(model)
                setOpen(false)
              }}
            >
              <span className="size-4">{model.id === selectedModelId ? <CheckIcon /> : null}</span>
              <ModelSelectorLogo provider={model.provider} />
              <ModelSelectorName>{model.label}</ModelSelectorName>
              <span className="truncate text-xs text-muted-foreground">
                {model.modelId}
                {model.description ? ` — ${model.description}` : ''}
              </span>
            </ModelSelectorItem>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelectorPrimitive>
  )
}

export const SessionModelSelector = ModelSelector
export type SessionModelSelectorProps = ModelSelectorProps
