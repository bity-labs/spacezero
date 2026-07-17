import { CaretDownIcon } from '@phosphor-icons/react'
import { useMemo, useState, type KeyboardEvent } from 'react'

import type { AgentSkillDescriptor } from '../../../../features/agent-workspace/shared/agent-skill.model'
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

export type ChatInputSkill = AgentSkillDescriptor

export type ChatInputProps = {
  disabled?: boolean
  status?: ChatInputStatus
  placeholder?: string
  autoFocus?: boolean
  models?: ChatInputModel[]
  selectedModelId?: string
  thinkingLevel?: AiChatThinkingLevel
  skills?: ChatInputSkill[]
  onModelChange?: (modelId: string) => void
  onThinkingChange?: (level: AiChatThinkingLevel) => void
  onSubmit: (input: ChatInputSubmit) => void
  onAbort?: () => void
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
  skills = [],
  onModelChange,
  onThinkingChange,
  onSubmit,
  onAbort,
  className
}: ChatInputProps) {
  const [uncontrolledModelId, setUncontrolledModelId] = useState<string | undefined>(undefined)
  const [isModelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [isSkillMenuDismissed, setSkillMenuDismissed] = useState(false)
  const fallbackModelId = models[0]?.id
  const activeModelId = selectedModelId ?? uncontrolledModelId ?? fallbackModelId
  const selectedModel = useMemo(
    () => models.find((model) => model.id === activeModelId),
    [activeModelId, models]
  )
  const skillSuggestions = useMemo(
    () => (isSkillMenuDismissed ? [] : getSkillSuggestions(inputValue, skills)),
    [inputValue, isSkillMenuDismissed, skills]
  )
  const selectedSkill = skillSuggestions[Math.min(activeSkillIndex, skillSuggestions.length - 1)]

  const isRunning = disabled || status === 'submitted' || status === 'streaming'

  const handleModelChange = (modelId: string) => {
    setUncontrolledModelId(modelId)
    setModelSelectorOpen(false)
    onModelChange?.(modelId)
  }

  const handleSubmit = ({ text, files }: { text: string; files: PromptInputFile[] }) => {
    setInputValue('')
    setActiveSkillIndex(0)
    setSkillMenuDismissed(false)
    onSubmit({
      text,
      files: files.map((item) => item.file),
      modelId: activeModelId
    })
  }

  const handleSkillKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (skillSuggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSkillIndex((index) => (index + 1) % skillSuggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSkillIndex(
        (index) => (index - 1 + skillSuggestions.length) % skillSuggestions.length
      )
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setSkillMenuDismissed(true)
      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      if (selectedSkill) {
        setInputValue(`/skill:${selectedSkill.name}`)
        setActiveSkillIndex(0)
        setSkillMenuDismissed(true)
      }
    }
  }

  function selectSkill(skill: ChatInputSkill): void {
    setInputValue(`/skill:${skill.name}`)
    setActiveSkillIndex(0)
    setSkillMenuDismissed(true)
  }

  return (
    <div className="relative w-full">
      <PromptInput
        className={className}
        disabled={isRunning}
        onSubmit={(message) => handleSubmit(message)}
      >
        <PromptInputAttachments />
        <PromptInputTextarea
          aria-label="Agent prompt"
          aria-autocomplete={skillSuggestions.length > 0 ? 'list' : undefined}
          aria-controls={skillSuggestions.length > 0 ? 'agent-skill-suggestions' : undefined}
          aria-expanded={skillSuggestions.length > 0}
          autoFocus={autoFocus}
          disabled={isRunning}
          onChange={(event) => {
            setInputValue(event.currentTarget.value)
            setActiveSkillIndex(0)
            setSkillMenuDismissed(false)
          }}
          onKeyDown={handleSkillKeyDown}
          placeholder={placeholder}
          value={inputValue}
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
                <ModelSelector open={isModelSelectorOpen} onOpenChange={setModelSelectorOpen}>
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
          <PromptInputSubmit onStop={onAbort} status={status} />
        </PromptInputFooter>
      </PromptInput>
      {skillSuggestions.length > 0 ? (
        <div
          id="agent-skill-suggestions"
          aria-label="Available skills"
          className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {skillSuggestions.map((skill, index) => (
            <button
              key={`${skill.scope}:${skill.name}`}
              type="button"
              role="option"
              aria-selected={index === Math.min(activeSkillIndex, skillSuggestions.length - 1)}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSkill(skill)}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">/skill:{skill.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {skill.description}
                </span>
              </span>
              <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                {skill.scope}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function getSkillSuggestions(value: string, skills: ChatInputSkill[]): ChatInputSkill[] {
  const query = getSkillCommandQuery(value)
  if (query === null) return []

  const normalizedQuery = query.toLowerCase()
  return skills.filter((skill) =>
    `${skill.name} ${skill.description}`.toLowerCase().includes(normalizedQuery)
  )
}

function getSkillCommandQuery(value: string): string | null {
  if (!value.startsWith('/') || /\s/.test(value)) return null

  const command = value.slice(1)
  const normalizedCommand = command.toLowerCase()
  if (normalizedCommand === '' || normalizedCommand === 'skill') return ''
  if (normalizedCommand.startsWith('skill:')) return command.slice('skill:'.length)

  return command
}
