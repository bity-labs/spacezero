import { CaretDownIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger
} from '@renderer/components/ui/model-selector'
import type { AiChatThinkingLevel } from './ai-chat.types'
import { ThinkingSelector } from './thinking-selector'

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachments,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputFile
} from '@renderer/components/ui/prompt-input'
export type ChatInputStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export type ChatInputModel = {
  id: string
  label: string
  provider?: string
}

export type ChatInputSubmit = {
  text: string
  files: File[]
  modelId?: string
}

export type ChatInputProps = {
  disabled?: boolean
  status?: ChatInputStatus
  placeholder?: string
  autoFocus?: boolean
  models?: ChatInputModel[]
  selectedModelId?: string
  thinkingLevel?: AiChatThinkingLevel
  onModelChange?: (modelId: string) => void
  onThinkingChange?: (level: AiChatThinkingLevel) => void
  onSubmit: (input: ChatInputSubmit) => void
  className?: string
}

export function ChatInput({
  disabled = false,
  status = 'ready',
  placeholder = 'Ask the agent anything...',
  autoFocus = false,
  models = [],
  selectedModelId,
  thinkingLevel,
  onModelChange,
  onThinkingChange,
  onSubmit,
  className
}: ChatInputProps) {
  const [uncontrolledModelId, setUncontrolledModelId] = useState<string | undefined>(undefined)
  const fallbackModelId = models[0]?.id
  const activeModelId = selectedModelId ?? uncontrolledModelId ?? fallbackModelId
  const selectedModel = useMemo(
    () => models.find((model) => model.id === activeModelId),
    [activeModelId, models]
  )

  const isRunning = disabled || status === 'submitted' || status === 'streaming'

  const handleModelChange = (modelId: string) => {
    setUncontrolledModelId(modelId)
    onModelChange?.(modelId)
  }

  const handleSubmit = ({ text, files }: { text: string; files: PromptInputFile[] }) => {
    onSubmit({
      text,
      files: files.map((item) => item.file),
      modelId: activeModelId
    })
  }

  return (
    <PromptInput
      className={className}
      disabled={isRunning}
      onSubmit={(message) => handleSubmit(message)}
    >
      <PromptInputAttachments />
      <PromptInputTextarea
        aria-label="Agent prompt"
        autoFocus={autoFocus}
        disabled={isRunning}
        placeholder={placeholder}
      />
      <PromptInputFooter>
        <PromptInputTools>
          <PromptInputActionMenu>
            <PromptInputActionMenuTrigger aria-label="Add attachment" disabled={isRunning} />
            <PromptInputActionMenuContent>
              <PromptInputActionAddAttachments />
            </PromptInputActionMenuContent>
          </PromptInputActionMenu>
          <div className="flex items-center gap-1">
            {models.length > 0 ? (
              <ModelSelector>
                <ModelSelectorTrigger
                  render={
                    <button
                      className="flex max-w-48 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                      disabled={isRunning}
                      type="button"
                    />
                  }
                >
                  {selectedModel?.provider ? (
                    <ModelSelectorLogo provider={selectedModel.provider} />
                  ) : null}
                  <span className="truncate">{selectedModel?.label ?? 'Select model'}</span>
                  <CaretDownIcon className="size-3" aria-hidden="true" />
                </ModelSelectorTrigger>
                <ModelSelectorContent>
                  <ModelSelectorInput placeholder="Search models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup>
                      {models.map((model) => (
                        <ModelSelectorItem
                          key={model.id}
                          data-checked={model.id === activeModelId}
                          onSelect={() => handleModelChange(model.id)}
                        >
                          {model.provider ? <ModelSelectorLogo provider={model.provider} /> : null}
                          <ModelSelectorName>{model.label}</ModelSelectorName>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
            ) : null}
            {thinkingLevel && onThinkingChange ? (
              <ThinkingSelector
                value={thinkingLevel}
                disabled={isRunning}
                onChange={onThinkingChange}
              />
            ) : null}
          </div>
        </PromptInputTools>
        <PromptInputSubmit disabled={isRunning} status={status} />
      </PromptInputFooter>
    </PromptInput>
  )
}
