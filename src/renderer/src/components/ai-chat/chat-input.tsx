import { BookOpenText, CaretDownIcon, Command, FileText, Sparkle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'

import type { AgentSkillDescriptor } from '../../../../features/agent-workspace/shared/agent-skill.model'
import type { AgentDefinitionScope } from '../../../../features/agents/shared'
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
  PromptSuggestionEmpty,
  PromptSuggestionItem,
  PromptSuggestionMenu
} from './prompt-suggestion-menu'

import {
  PromptInput,
  PromptInputAddAttachmentButton,
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

export type ChatInputSubmitFile = {
  name: string
  type: string
  path: string
}

export type ChatInputSubmit = {
  text: string
  files: ChatInputSubmitFile[]
  modelId?: string
  agentDefinitionId?: string
}

export type ChatInputKnowledgeBaseMentionResult =
  { state: 'ready'; paths: string[] } | { state: 'unconfigured' }

export type ChatInputFileMentionResult = { state: 'ready'; paths: string[] }

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
  resolveFilePath?: (file: File) => string
  loadKnowledgeBaseMentionPaths?: () => Promise<ChatInputKnowledgeBaseMentionResult>
  loadFileMentionPaths?: () => Promise<ChatInputFileMentionResult>
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
  resolveFilePath,
  loadKnowledgeBaseMentionPaths,
  loadFileMentionPaths,
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
  const [fileMentionItems, setFileMentionItems] = useState<string[]>([])
  const [fileMentionState, setFileMentionState] = useState<'loading' | 'ready' | 'error'>('loading')
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
  const activeFileMention = activeKnowledgeBaseMention
    ? undefined
    : getActiveFileMentionQuery(inputValue)
  const isFileMentionActive = activeFileMention !== undefined
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

  const fileMentionOptions = useMemo(
    () =>
      activeFileMention
        ? fileMentionItems.filter((path) =>
            path.toLowerCase().includes(activeFileMention.query.toLowerCase())
          )
        : [],
    [activeFileMention, fileMentionItems]
  )
  const promptMentionSuggestions = useMemo(
    (): PromptMentionSuggestion[] => [
      { kind: 'knowledge-base-source' },
      ...fileMentionOptions.slice(0, 20).map((path) => ({ kind: 'file' as const, path }))
    ],
    [fileMentionOptions]
  )

  const selectedKnowledgeBaseMentionPath =
    knowledgeBaseMentionOptions[
      Math.min(activeSuggestionIndex, knowledgeBaseMentionOptions.length - 1)
    ]
  const selectedPromptMentionSuggestion =
    promptMentionSuggestions[Math.min(activeSuggestionIndex, promptMentionSuggestions.length - 1)]
  const selectedHistoryItem =
    historyItems?.[Math.min(activeSuggestionIndex, historyItems.length - 1)]
  const isRunning = disabled || status === 'submitted' || status === 'streaming'

  useEffect(() => {
    if (!isKnowledgeBaseMentionActive) return

    let current = true
    const loadPaths = loadKnowledgeBaseMentionPaths ?? loadUnavailableKnowledgeBaseMentionPaths
    void loadPaths()
      .then((result) => {
        if (!current) return
        if (result.state === 'unconfigured') {
          setKnowledgeBaseItems([])
          setKnowledgeBaseMentionState('unconfigured')
          return
        }
        setKnowledgeBaseItems(result.paths)
        setKnowledgeBaseMentionState('ready')
      })
      .catch(() => {
        if (current) setKnowledgeBaseMentionState('error')
      })
    return () => {
      current = false
    }
  }, [isKnowledgeBaseMentionActive, loadKnowledgeBaseMentionPaths])

  useEffect(() => {
    if (!isFileMentionActive) return

    let current = true
    const loadPaths = loadFileMentionPaths ?? loadUnavailableFileMentionPaths
    void loadPaths()
      .then((result) => {
        if (!current) return
        setFileMentionItems(result.paths)
        setFileMentionState('ready')
      })
      .catch(() => {
        if (current) setFileMentionState('error')
      })
    return () => {
      current = false
    }
  }, [isFileMentionActive, loadFileMentionPaths])

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
          files: files.map((item) => ({
            name: item.file.name,
            type: item.file.type,
            path: item.path
          })),
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
          (index) =>
            (index - 1 + knowledgeBaseMentionOptions.length) % knowledgeBaseMentionOptions.length
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
        if (selectedKnowledgeBaseMentionPath)
          selectKnowledgeBaseMention(selectedKnowledgeBaseMentionPath)
      }
      return
    }

    if (activeFileMention) {
      if (promptMentionSuggestions.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveSuggestionIndex((index) => (index + 1) % promptMentionSuggestions.length)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveSuggestionIndex(
          (index) => (index - 1 + promptMentionSuggestions.length) % promptMentionSuggestions.length
        )
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setInputValue(inputValue.slice(0, activeFileMention.start))
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        if (selectedPromptMentionSuggestion)
          selectPromptMentionSuggestion(selectedPromptMentionSuggestion)
      }
      return
    }

    if (historyItems !== undefined) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setActiveSuggestionIndex(0)
        onHistoryDismiss?.()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (historyItems.length > 0) {
          setActiveSuggestionIndex((index) => (index + 1) % historyItems.length)
        }
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (historyItems.length > 0) {
          setActiveSuggestionIndex(
            (index) => (index - 1 + historyItems.length) % historyItems.length
          )
        }
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        if (selectedHistoryItem) selectHistoryItem(selectedHistoryItem.id)
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
    if (suggestion.kind === 'command' && suggestion.command.name === 'resume' && onCommand) {
      setInputValue('/resume')
      setActiveSuggestionIndex(0)
      setSlashMenuDismissed(true)
      void Promise.resolve(onCommand(suggestion.command.name)).catch(() => undefined)
      return
    }

    setInputValue(
      suggestion.kind === 'command'
        ? `/${suggestion.command.name}`
        : `/skill:${suggestion.skill.name}`
    )
    setActiveSuggestionIndex(0)
    setSlashMenuDismissed(true)
  }

  function selectPromptMentionSuggestion(suggestion: PromptMentionSuggestion): void {
    if (!activeFileMention) return

    if (suggestion.kind === 'knowledge-base-source') {
      setInputValue(`${inputValue.slice(0, activeFileMention.start)}@kb`)
      setActiveSuggestionIndex(0)
      return
    }

    setInputValue(`${inputValue.slice(0, activeFileMention.start)}@${suggestion.path} `)
    setActiveSuggestionIndex(0)
  }

  function selectKnowledgeBaseMention(path: string): void {
    if (!activeKnowledgeBaseMention) return
    const encodedPath = encodeKnowledgeBaseMentionPath(path)
    setInputValue(`${inputValue.slice(0, activeKnowledgeBaseMention.start)}@kb/${encodedPath} `)
  }

  function selectHistoryItem(historyItemId: string): void {
    setInputValue('')
    setActiveSuggestionIndex(0)
    void Promise.resolve(onHistorySelect?.(historyItemId)).catch(() => undefined)
  }

  return (
    <div className="relative w-full">
      <PromptInput
        className={className}
        disabled={isRunning}
        resolveFilePath={resolveFilePath}
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
              : activeFileMention
                ? 'file-mention-suggestions'
                : historyItems
                  ? 'chat-context-history'
                  : slashSuggestions.length > 0
                    ? 'slash-suggestions'
                    : undefined
          }
          aria-expanded={
            historyItems !== undefined ||
            slashSuggestions.length > 0 ||
            Boolean(activeKnowledgeBaseMention) ||
            Boolean(activeFileMention)
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
            <PromptInputAddAttachmentButton aria-label="Add attachment" disabled={isRunning} />
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
        <PromptSuggestionMenu id="knowledge-base-path-suggestions" label="Knowledge Base paths">
          {knowledgeBaseMentionState === 'loading' ? (
            <PromptSuggestionEmpty>Loading Knowledge Base paths…</PromptSuggestionEmpty>
          ) : knowledgeBaseMentionState === 'unconfigured' ? (
            <PromptSuggestionEmpty>
              Knowledge Base is not configured. Open Knowledge Base to set it up.
            </PromptSuggestionEmpty>
          ) : knowledgeBaseMentionState === 'error' ? (
            <p className="px-3 py-2 text-xs text-destructive">
              Unable to load Knowledge Base paths.
            </p>
          ) : knowledgeBaseMentionOptions.length === 0 ? (
            <PromptSuggestionEmpty>No matching paths.</PromptSuggestionEmpty>
          ) : (
            knowledgeBaseMentionOptions
              .slice(0, 20)
              .map((path, index) => (
                <PromptSuggestionItem
                  key={path}
                  icon={<BookOpenText data-knowledge-base-icon="true" className="size-4" />}
                  title={knowledgeBaseMentionTitle(path)}
                  description={path}
                  selected={
                    index ===
                    Math.min(activeSuggestionIndex, knowledgeBaseMentionOptions.length - 1)
                  }
                  onSelect={() => selectKnowledgeBaseMention(path)}
                />
              ))
          )}
        </PromptSuggestionMenu>
      ) : activeFileMention ? (
        <PromptSuggestionMenu id="file-mention-suggestions" label="Mention sources and files">
          <PromptSuggestionItem
            icon={<BookOpenText data-knowledge-base-source-icon="true" className="size-4" />}
            title="Knowledge Base"
            description="Mention files from your Space Zero Knowledge Base."
            suffix="source"
            selected={activeSuggestionIndex === 0}
            onSelect={() => selectPromptMentionSuggestion({ kind: 'knowledge-base-source' })}
          />
          {fileMentionState === 'loading' ? (
            <PromptSuggestionEmpty>Loading file paths…</PromptSuggestionEmpty>
          ) : fileMentionState === 'error' ? (
            <p className="px-3 py-2 text-xs text-destructive">Unable to load file paths.</p>
          ) : fileMentionOptions.length === 0 ? (
            <PromptSuggestionEmpty>No matching files.</PromptSuggestionEmpty>
          ) : (
            fileMentionOptions
              .slice(0, 20)
              .map((path, index) => (
                <PromptSuggestionItem
                  key={path}
                  icon={<FileText data-file-mention-icon="true" className="size-4" />}
                  title={fileMentionTitle(path)}
                  description={path}
                  selected={
                    index + 1 ===
                    Math.min(activeSuggestionIndex, promptMentionSuggestions.length - 1)
                  }
                  onSelect={() => selectPromptMentionSuggestion({ kind: 'file', path })}
                />
              ))
          )}
        </PromptSuggestionMenu>
      ) : historyItems !== undefined ? (
        <PromptSuggestionMenu id="chat-context-history" label="Chat Context history">
          {historyItems.length === 0 ? (
            <PromptSuggestionEmpty>No older Chat Contexts with prompts.</PromptSuggestionEmpty>
          ) : (
            historyItems.map((item, index) => (
              <PromptSuggestionItem
                key={item.id}
                icon={<FileText data-chat-history-icon="true" className="size-4" />}
                title={item.initialPrompt}
                titleClassName="truncate"
                selected={index === Math.min(activeSuggestionIndex, historyItems.length - 1)}
                onSelect={() => selectHistoryItem(item.id)}
              >
                {item.createdAt ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatChatContextDate(item.createdAt)}
                  </span>
                ) : null}
              </PromptSuggestionItem>
            ))
          )}
        </PromptSuggestionMenu>
      ) : slashSuggestions.length > 0 ? (
        <PromptSuggestionMenu
          id="slash-suggestions"
          label={commands.length > 0 ? 'Available commands and skills' : 'Available skills'}
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
              <PromptSuggestionItem
                key={key}
                icon={
                  isCommand ? (
                    <Command data-command-icon="true" className="size-4" />
                  ) : (
                    <Sparkle className="size-4" />
                  )
                }
                title={name}
                description={description}
                suffix={suffix}
                selected={index === Math.min(activeSuggestionIndex, slashSuggestions.length - 1)}
                onSelect={() => selectSlashSuggestion(suggestion)}
                data-suggestion-kind={suggestion.kind}
              />
            )
          })}
        </PromptSuggestionMenu>
      ) : null}
    </div>
  )
}

async function loadUnavailableKnowledgeBaseMentionPaths(): Promise<ChatInputKnowledgeBaseMentionResult> {
  return { state: 'unconfigured' }
}

async function loadUnavailableFileMentionPaths(): Promise<ChatInputFileMentionResult> {
  return { state: 'ready', paths: [] }
}

type PromptMentionSuggestion = { kind: 'knowledge-base-source' } | { kind: 'file'; path: string }

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

function getActiveFileMentionQuery(value: string): { start: number; query: string } | undefined {
  const match = /@([^\s]*)$/.exec(value)
  if (!match || match.index < 0) return undefined
  return { start: match.index, query: match[1] ?? '' }
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

function fileMentionTitle(path: string): string {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path
  return normalized.split('/').at(-1) || path
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
