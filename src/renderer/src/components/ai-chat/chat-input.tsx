import { CaretDownIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'

import type { AgentSkillDescriptor } from '../../../../features/agent-workspace/shared/agent-skill.model'
import type { AgentDefinitionScope } from '../../../../features/agents/shared'
import {
  KNOWLEDGE_BASE_FILES_CONTEXT_KEY,
  type FilesEntry
} from '../../../../features/files/shared'
import {
  encodeKnowledgeBaseMentionPath,
  getActiveKnowledgeBaseMentionQuery
} from '../../../../features/knowledge-base/shared'
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
  agentDefinitionId?: string
}

export type ChatInputSkill = AgentSkillDescriptor

export type ChatInputAgentDefinition = {
  id: string
  name: string
  description: string
  scope: AgentDefinitionScope
}

export type ChatInputActiveAgentDefinition = {
  id: string
  name: string
}

export type ChatInputProps = {
  disabled?: boolean
  status?: ChatInputStatus
  placeholder?: string
  autoFocus?: boolean
  models?: ChatInputModel[]
  selectedModelId?: string
  thinkingLevel?: AiChatThinkingLevel
  skills?: ChatInputSkill[]
  agentDefinitions?: ChatInputAgentDefinition[]
  selectedAgentDefinitionId?: string
  activeAgentDefinition?: ChatInputActiveAgentDefinition
  agentDefinitionLocked?: boolean
  onAgentDefinitionChange?: (definitionId: string | undefined) => void
  onAgentDefinitionPickerOpen?: () => void
  onModelChange?: (modelId: string) => void
  onThinkingChange?: (level: AiChatThinkingLevel) => void
  onSubmit: (input: ChatInputSubmit) => void | Promise<void>
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
  agentDefinitions = [],
  selectedAgentDefinitionId,
  activeAgentDefinition,
  agentDefinitionLocked = false,
  onAgentDefinitionChange,
  onAgentDefinitionPickerOpen,
  onModelChange,
  onThinkingChange,
  onSubmit,
  onAbort,
  className
}: ChatInputProps) {
  const [uncontrolledModelId, setUncontrolledModelId] = useState<string | undefined>(undefined)
  const [uncontrolledAgentDefinitionId, setUncontrolledAgentDefinitionId] = useState<
    string | undefined
  >(undefined)
  const [isModelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [isAgentDefinitionSelectorOpen, setAgentDefinitionSelectorOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [isSkillMenuDismissed, setSkillMenuDismissed] = useState(false)
  const [knowledgeBaseItems, setKnowledgeBaseItems] = useState<string[]>([])
  const [knowledgeBaseMentionState, setKnowledgeBaseMentionState] = useState<
    'loading' | 'ready' | 'unconfigured' | 'error'
  >('loading')
  const fallbackModelId = models[0]?.id
  const activeModelId = selectedModelId ?? uncontrolledModelId ?? fallbackModelId
  const selectedModel = useMemo(
    () => models.find((model) => model.id === activeModelId),
    [activeModelId, models]
  )
  const activeAgentDefinitionId = selectedAgentDefinitionId ?? uncontrolledAgentDefinitionId
  const selectedAgentDefinition = useMemo(
    () => agentDefinitions.find((definition) => definition.id === activeAgentDefinitionId),
    [activeAgentDefinitionId, agentDefinitions]
  )
  const showAgentDefinitionPicker =
    !agentDefinitionLocked && agentDefinitions.length > 0 && Boolean(onAgentDefinitionChange)
  const showActiveAgentDefinitionChip = agentDefinitionLocked && Boolean(activeAgentDefinition)
  const skillSuggestions = useMemo(
    () => (isSkillMenuDismissed ? [] : getSkillSuggestions(inputValue, skills)),
    [inputValue, isSkillMenuDismissed, skills]
  )
  const selectedSkill = skillSuggestions[Math.min(activeSkillIndex, skillSuggestions.length - 1)]
  const activeKnowledgeBaseMention = getActiveKnowledgeBaseMentionQuery(inputValue)
  const isKnowledgeBaseMentionActive = activeKnowledgeBaseMention !== undefined
  const knowledgeBaseMentionOptions = useMemo(
    () =>
      activeKnowledgeBaseMention
        ? knowledgeBaseItems.filter((path) =>
            encodeKnowledgeBaseMentionPath(path)
              .toLowerCase()
              .startsWith(activeKnowledgeBaseMention.query.toLowerCase())
          )
        : [],
    [activeKnowledgeBaseMention, knowledgeBaseItems]
  )

  const isRunning = disabled || status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (!isKnowledgeBaseMentionActive) return
    let current = true
    void window.spacezero.knowledgeBase
      .getStatus()
      .then(async (knowledgeBaseStatus) => {
        if (!current) return
        if (knowledgeBaseStatus.setupState !== 'configured') {
          setKnowledgeBaseMentionState('unconfigured')
          return
        }
        const paths = await listKnowledgeBaseMentionPaths()
        if (!current) return
        setKnowledgeBaseItems(paths)
        setKnowledgeBaseMentionState('ready')
      })
      .catch(() => {
        if (current) setKnowledgeBaseMentionState('error')
      })
    return () => {
      current = false
    }
  }, [isKnowledgeBaseMentionActive])

  const handleModelChange = (modelId: string) => {
    setUncontrolledModelId(modelId)
    setModelSelectorOpen(false)
    onModelChange?.(modelId)
  }

  const handleAgentDefinitionOpenChange = (open: boolean) => {
    setAgentDefinitionSelectorOpen(open)
    if (open) onAgentDefinitionPickerOpen?.()
  }

  const handleAgentDefinitionChange = (definitionId: string | undefined) => {
    setUncontrolledAgentDefinitionId(definitionId)
    setAgentDefinitionSelectorOpen(false)
    onAgentDefinitionChange?.(definitionId)
  }

  const handleSubmit = async ({ text, files }: { text: string; files: PromptInputFile[] }) => {
    try {
      await onSubmit({
        text,
        files: files.map((item) => item.file),
        modelId: activeModelId,
        ...(selectedAgentDefinition ? { agentDefinitionId: selectedAgentDefinition.id } : {})
      })
      setInputValue('')
      setActiveSkillIndex(0)
      setSkillMenuDismissed(false)
    } catch {
      // Keep the submitted prompt visible; the caller owns surfacing the failure.
    }
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

  function selectKnowledgeBaseMention(path: string): void {
    if (!activeKnowledgeBaseMention) return
    const encodedPath = encodeKnowledgeBaseMentionPath(path)
    setInputValue(`${inputValue.slice(0, activeKnowledgeBaseMention.start)}@kb/${encodedPath} `)
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
          aria-autocomplete={
            skillSuggestions.length > 0 || activeKnowledgeBaseMention ? 'list' : undefined
          }
          aria-controls={
            activeKnowledgeBaseMention
              ? 'knowledge-base-path-suggestions'
              : skillSuggestions.length > 0
                ? 'agent-skill-suggestions'
                : undefined
          }
          aria-expanded={skillSuggestions.length > 0 || Boolean(activeKnowledgeBaseMention)}
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
        {activeKnowledgeBaseMention ? (
          <div
            id="knowledge-base-path-suggestions"
            className="mx-2 max-h-40 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            role="listbox"
            aria-label="Knowledge Base paths"
          >
            {knowledgeBaseMentionState === 'loading' ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Loading Knowledge Base paths…
              </p>
            ) : knowledgeBaseMentionState === 'unconfigured' ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Knowledge Base is not configured. Open Knowledge Base to set it up.
              </p>
            ) : knowledgeBaseMentionState === 'error' ? (
              <p className="px-2 py-1.5 text-xs text-destructive">
                Unable to load Knowledge Base paths.
              </p>
            ) : knowledgeBaseMentionOptions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No matching paths.</p>
            ) : (
              knowledgeBaseMentionOptions.slice(0, 20).map((path) => (
                <button
                  key={path}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => selectKnowledgeBaseMention(path)}
                >
                  @kb/{path}
                </button>
              ))
            )}
          </div>
        ) : null}
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger aria-label="Add attachment" disabled={isRunning} />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            <div className="flex items-center gap-1">
              {showAgentDefinitionPicker ? (
                <ModelSelector
                  open={isAgentDefinitionSelectorOpen}
                  onOpenChange={handleAgentDefinitionOpenChange}
                >
                  <ModelSelectorTrigger
                    render={
                      <button
                        aria-label={`Agent Definition: ${selectedAgentDefinition?.name ?? 'None'}`}
                        className="flex max-w-48 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                        disabled={isRunning}
                        type="button"
                      />
                    }
                  >
                    <span className="truncate">
                      Agent: {selectedAgentDefinition?.name ?? 'None'}
                    </span>
                    <CaretDownIcon className="size-3" aria-hidden="true" />
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
                    <ModelSelectorInput placeholder="Search Agent Definitions..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No Agent Definitions found.</ModelSelectorEmpty>
                      <ModelSelectorGroup>
                        <ModelSelectorItem
                          data-checked={activeAgentDefinitionId === undefined}
                          onSelect={() => handleAgentDefinitionChange(undefined)}
                        >
                          <ModelSelectorName>No Agent Definition</ModelSelectorName>
                        </ModelSelectorItem>
                        {agentDefinitions.map((definition) => (
                          <ModelSelectorItem
                            key={`${definition.scope}:${definition.id}`}
                            data-checked={definition.id === activeAgentDefinitionId}
                            onSelect={() => handleAgentDefinitionChange(definition.id)}
                          >
                            <div className="min-w-0 flex-1 text-left">
                              <ModelSelectorName>{definition.name}</ModelSelectorName>
                              <p className="truncate text-xs text-muted-foreground">
                                {definition.description}
                              </p>
                            </div>
                            <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">
                              {definition.scope}
                            </span>
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              ) : null}
              {showActiveAgentDefinitionChip && activeAgentDefinition ? (
                <span className="flex max-w-48 items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-wide">Agent Definition</span>
                  <span className="truncate font-medium text-foreground">
                    {activeAgentDefinition.name}
                  </span>
                </span>
              ) : null}
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
                            {model.provider ? (
                              <ModelSelectorLogo provider={model.provider} />
                            ) : null}
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

async function listKnowledgeBaseMentionPaths(relativePath = ''): Promise<string[]> {
  const entries = await window.spacezero.files.listDirectory({
    context: { kind: 'knowledge-base', contextKey: KNOWLEDGE_BASE_FILES_CONTEXT_KEY },
    relativePath
  })
  const paths = await Promise.all(entries.map(listKnowledgeBaseMentionEntry))
  return paths.flat()
}

async function listKnowledgeBaseMentionEntry(entry: FilesEntry): Promise<string[]> {
  if (entry.kind === 'symlink') return []
  if (entry.kind === 'file') return [entry.relativePath]
  return [`${entry.relativePath}/`, ...(await listKnowledgeBaseMentionPaths(entry.relativePath))]
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
