import * as React from 'react'

import { cn } from '@renderer/lib/utils'

export type SessionModelOption = {
  id: string
  name: string
  provider?: string
}

export type SessionModelSelectorProps = {
  models: SessionModelOption[]
  selectedModelId?: string
  onModelChange: (modelId: string) => void
  disabled?: boolean
  className?: string
}

export function SessionModelSelector({
  models,
  selectedModelId,
  onModelChange,
  disabled = false,
  className
}: SessionModelSelectorProps): React.JSX.Element {
  return (
    <label className={cn('flex items-center gap-2 text-sm', className)}>
      <span className="text-muted-foreground">Model</span>
      <select
        aria-label="Session model"
        value={selectedModelId ?? ''}
        disabled={disabled || models.length === 0}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => onModelChange(event.target.value)}
      >
        {models.length === 0 ? <option value="">No models available</option> : null}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.provider ? `${model.provider} · ${model.name}` : model.name}
          </option>
        ))}
      </select>
    </label>
  )
}
