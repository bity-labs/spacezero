import { BookOpenText, CaretDownIcon, Command, FileText, Sparkle } from '@phosphor-icons/react'
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

const thinkingLevels: readonly AiChatThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

export type ChatInputModel = {
  id: string
  label: string
  provider?: string
  supportedThinkingLevels?: AiChatThinkingLevel[]
}

export type ChatInputSubmit = {
  text: string
  files: File[]
  modelId?: string
  agentDefinitionId?: string
}

export type ChatInputSkill = AgentSkillDescriptor

export type ChatInputCommand = {
  name: string
  description: string
}

export type ChatInputHistoryItem = {
  id: string
  initialPrompt: string
  createdAt?: string
}

export type ChatInputAgentDefinition = {
  id: string
  name: string
  description: string
  scope: AgentDefinitionScope
  disabled?: boolean
  unavailableReason?: string
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
  commands?: ChatInputCommand[]
  historyItems?: ChatInputHistoryItem[]
  agentDefinitions?: ChatInputAgentDefinition[]
  selectedAgentDefinitionId?: string
  activeAgentDefinition?: ChatInputActiveAgentDefinition
  agentDefinitionLocked?: boolean
  onAgentDefinitionChange?: (definitionId: string | undefined) => void
  onAgentDefinitionPickerOpen?: () => void
  onModelChange?: (modelId: string) => void
  onThinkingChange?: (level: AiChatThinkingLevel) => void
  onCommand?: (commandName: string) => void | Promise<void>
  onHistorySelect?: (historyItemId: string) => void | Promise<void>
  onHistoryDismiss?: () => void
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
  commands = [],
  historyItems,
  agentDefinitions = [],
  selectedAgentDefinitionId,
  activeAgentDefinition,
  agentDefinitionLocked = false,
  onAgentDefinitionChange,
  onAgentDefinitionPickerOpen,
  onModelChange,
  onThinkingChange,
  onCommand,
  onHistorySelect,
  onHistoryDismiss,
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
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const [isSlashMenuDismissed, setSlashMenuDismissed] = useState(false)
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
    () =>
      agentDefinitions.find(
        (definition) => definition.id === activeAgentDefinitionId && !definition.disabled
      ),
    [activeAgentDefinitionId, agentDefinitions]
  )
  const showAgentDefinitionPicker =
    !agentDefinitionLocked && agentDefinitions.length > 0 && Boolean(onAgentDefinitionChange)
  const showActiveAgentDefinitionChip = agentDefinitionLocked && Boolean(activeAgentDefinition)
  const slashSuggestions = useMemo(
    () => (isSlashMenuDismissed ? [] : getSlashSuggestions(inputValue, commands, skills)),
    [commands, inputValue, isSlashMenuDismissed, skills]
  )
  const selectedSuggestion =
    slashSuggestions[Math.min(activeSuggestionIndex, slashSuggestions.length - 1)]
  const availableThinkingLevels = selectedModel?.supportedThinkingLevels ?? thinkingLevels
  const activeThinkingLevel = thinkingLevel
    ? clampThinkingLevel(thinkingLevel, availableThinkingLevels)
    : undefined
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

  const selectedKnowledgeBaseMentionPath =
    knowledgeBaseMentionOptions[
      Math.min(activeSuggestionIndex, knowledgeBaseMentionOptions.length - 1)
    ]
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
      const submittedCommand =
        files.length === 0
          ? commands.find((command) => `/${command.name}`.toLowerCase() === text.toLowerCase())
          : undefined
      if (submittedCommand && onCommand) {
        await onCommand(submittedCommand.name)
      } else {
        await onSubmit({
          text,
          files: files.map((item) => item.file),
          modelId: activeModelId,
          ...(selectedAgentDefinition ? { agentDefinitionId: selectedAgentDefinition.id } : {})
        })
      }
      setInputValue('')
      setActiveSuggestionIndex(0)
      setSlashMenuDismissed(false)
    } catch {
      // Keep the submitted prompt visible; the caller owns surfacing the failure.
    }
  }

  const handleSuggestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (activeKnowledgeBaseMention) {
      if (knowledgeBaseMentionOptions.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveSuggestionIndex((index) => (index + 1) % knowledgeBaseMentionOptions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveSuggestionIndex(
          (index) => (index - 1 + knowledgeBaseMentionOptions.length) % knowledgeBaseMentionOptions.length
        )
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setInputValue(inputValue.slice(0, activeKnowledgeBaseMention.start))
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        if (selectedKnowledgeBaseMentionPath) selectKnowledgeBaseMention(selectedKnowledgeBaseMentionPath)
      }
      return
    }

    if (slashSuggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex((index) => (index + 1) % slashSuggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex(
        (index) => (index - 1 + slashSuggestions.length) % slashSuggestions.length
      )
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setSlashMenuDismissed(true)
      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (
        event.key === 'Enter' &&
        selectedSuggestion?.kind === 'command' &&
        inputValue.toLowerCase() === `/${selectedSuggestion.command.name}`.toLowerCase()
      ) {
        return
      }
      event.preventDefault()
      if (selectedSuggestion) selectSlashSuggestion(selectedSuggestion)
    }
  }

  function selectSlashSuggestion(suggestion: SlashSuggestion): void {
    setInputValue(
      suggestion.kind === 'command'
        ? `/${suggestion.command.name}`
        : `/skill:${suggestion.skill.name}`
    )
    setActiveSuggestionIndex(0)
    setSlashMenuDismissed(true)
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
            historyItems !== undefined || slashSuggestions.length > 0 || activeKnowledgeBaseMention
              ? 'list'
              : undefined
          }
          aria-controls={
            activeKnowledgeBaseMention
              ? 'knowledge-base-path-suggestions'
              : historyItems
                ? 'chat-context-history'
                : slashSuggestions.length > 0
                  ? 'slash-suggestions'
                  : undefined
          }
          aria-expanded={
            historyItems !== undefined ||
            slashSuggestions.length > 0 ||
            Boolean(activeKnowledgeBaseMention)
          }
          autoFocus={autoFocus}
          disabled={isRunning}
          onChange={(event) => {
            setInputValue(event.currentTarget.value)
            setActiveSuggestionIndex(0)
            setSlashMenuDismissed(false)
            if (historyItems !== undefined) onHistoryDismiss?.()
          }}
          onKeyDown={handleSuggestionKeyDown}
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
                            disabled={definition.disabled}
                            onSelect={() => {
                              if (!definition.disabled) handleAgentDefinitionChange(definition.id)
                            }}
                          >
                            <div className="min-w-0 flex-1 text-left">
                              <ModelSelectorName>{definition.name}</ModelSelectorName>
                              <p className="truncate text-xs text-muted-foreground">
                                {definition.unavailableReason ?? definition.description}
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
              {activeThinkingLevel && onThinkingChange ? (
                <ThinkingSelector
                  value={activeThinkingLevel}
                  availableLevels={availableThinkingLevels}
                  disabled={isRunning}
                  onChange={onThinkingChange}
                />
              ) : null}
            </div>
          </PromptInputTools>
          <PromptInputSubmit onStop={onAbort} status={status} />
        </PromptInputFooter>
      </PromptInput>
      {activeKnowledgeBaseMention ? (
        <div
          id="knowledge-base-path-suggestions"
          aria-label="Knowledge Base paths"
          className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {knowledgeBaseMentionState === 'loading' ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Loading Knowledge Base paths…
            </p>
          ) : knowledgeBaseMentionState === 'unconfigured' ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Knowledge Base is not configured. Open Knowledge Base to set it up.
            </p>
          ) : knowledgeBaseMentionState === 'error' ? (
            <p className="px-3 py-2 text-xs text-destructive">
              Unable to load Knowledge Base paths.
            </p>
          ) : knowledgeBaseMentionOptions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching paths.</p>
          ) : (
            knowledgeBaseMentionOptions.slice(0, 20).map((path, index) => (
              <button
                key={path}
                type="button"
                role="option"
                aria-selected={
                  index === Math.min(activeSuggestionIndex, knowledgeBaseMentionOptions.length - 1)
                }
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectKnowledgeBaseMention(path)}
              >
                <BookOpenText
                  data-knowledge-base-icon="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{knowledgeBaseMentionTitle(path)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {path}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : historyItems !== undefined ? (
        <div
          id="chat-context-history"
          aria-label="Chat Context history"
          className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {historyItems.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No older Chat Contexts with prompts.
            </p>
          ) : (
            historyItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected="false"
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  void Promise.resolve(onHistorySelect?.(item.id)).catch(() => undefined)
                }}
              >
                <FileText
                  data-chat-history-icon="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.initialPrompt}</span>
                  {item.createdAt ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatChatContextDate(item.createdAt)}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : slashSuggestions.length > 0 ? (
        <div
          id="slash-suggestions"
          aria-label={commands.length > 0 ? 'Available commands and skills' : 'Available skills'}
          className="absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
          role="listbox"
        >
          {slashSuggestions.map((suggestion, index) => {
            const isCommand = suggestion.kind === 'command'
            const name = isCommand
              ? formatCommandSuggestionTitle(suggestion.command.name)
              : suggestion.skill.name
            const description = isCommand
              ? suggestion.command.description
              : suggestion.skill.description
            const suffix = isCommand ? 'command' : suggestion.skill.scope
            const key = isCommand
              ? `command:${suggestion.command.name}`
              : `skill:${suggestion.skill.scope}:${suggestion.skill.name}`
            return (
              <button
                key={key}
                type="button"
                role="option"
                data-suggestion-kind={suggestion.kind}
                aria-selected={
                  index === Math.min(activeSuggestionIndex, slashSuggestions.length - 1)
                }
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSlashSuggestion(suggestion)}
              >
                {isCommand ? (
                  <Command
                    data-command-icon="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkle
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {description}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                  {suffix}
                </span>
              </button>
            )
          })}
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

type SlashSuggestion =
  { kind: 'command'; command: ChatInputCommand } | { kind: 'skill'; skill: ChatInputSkill }

function getSlashSuggestions(
  value: string,
  commands: ChatInputCommand[],
  skills: ChatInputSkill[]
): SlashSuggestion[] {
  const query = getSlashCommandQuery(value)
  if (!query) return []

  const normalizedQuery = query.value.toLowerCase()
  const skillSuggestions = skills
    .filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(normalizedQuery))
    .map((skill): SlashSuggestion => ({ kind: 'skill', skill }))
  if (query.skillsOnly) return skillSuggestions

  return [
    ...commands
      .filter((command) =>
        `${command.name} ${command.description}`.toLowerCase().includes(normalizedQuery)
      )
      .map((command): SlashSuggestion => ({ kind: 'command', command })),
    ...skillSuggestions
  ]
}

function getSlashCommandQuery(value: string): { value: string; skillsOnly: boolean } | undefined {
  if (!value.startsWith('/') || /\s/.test(value)) return undefined

  const command = value.slice(1)
  const normalizedCommand = command.toLowerCase()
  if (normalizedCommand === '' || normalizedCommand === 'skill') {
    return { value: '', skillsOnly: normalizedCommand === 'skill' }
  }
  if (normalizedCommand.startsWith('skill:')) {
    return { value: command.slice('skill:'.length), skillsOnly: true }
  }

  return { value: command, skillsOnly: false }
}

function formatCommandSuggestionTitle(commandName: string): string {
  return commandName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function knowledgeBaseMentionTitle(path: string): string {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path
  return normalized.split('/').at(-1) || path
}

function formatChatContextDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function clampThinkingLevel(
  requestedLevel: AiChatThinkingLevel,
  availableLevels: readonly AiChatThinkingLevel[]
): AiChatThinkingLevel {
  const levels = availableLevels.length > 0 ? availableLevels : thinkingLevels
  if (levels.includes(requestedLevel)) return requestedLevel

  const requestedIndex = thinkingLevels.indexOf(requestedLevel)
  if (requestedIndex === -1) return levels[0]

  for (let index = requestedIndex; index < thinkingLevels.length; index += 1) {
    const candidate = thinkingLevels[index]
    if (levels.includes(candidate)) return candidate
  }

  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = thinkingLevels[index]
    if (levels.includes(candidate)) return candidate
  }

  return levels[0]
}
