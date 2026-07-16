import { CaretDownIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

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
import {
  getActiveKnowledgeBaseMentionQuery,
  type KnowledgeBaseTreeItem
} from '../../../../features/knowledge-base/shared'
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
  onModelChange,
  onThinkingChange,
  onSubmit,
  onAbort,
  className
}: ChatInputProps) {
  const [uncontrolledModelId, setUncontrolledModelId] = useState<string | undefined>(undefined)
  const [isModelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [knowledgeBaseItems, setKnowledgeBaseItems] = useState<KnowledgeBaseTreeItem[]>([])
  const [knowledgeBaseMentionState, setKnowledgeBaseMentionState] = useState<
    'loading' | 'ready' | 'unconfigured' | 'error'
  >('loading')
  const fallbackModelId = models[0]?.id
  const activeModelId = selectedModelId ?? uncontrolledModelId ?? fallbackModelId
  const selectedModel = useMemo(
    () => models.find((model) => model.id === activeModelId),
    [activeModelId, models]
  )

  const isRunning = disabled || status === 'submitted' || status === 'streaming'
  const activeKnowledgeBaseMention = getActiveKnowledgeBaseMentionQuery(promptText)
  const isKnowledgeBaseMentionActive = activeKnowledgeBaseMention !== undefined
  const knowledgeBaseMentionOptions = useMemo(
    () =>
      activeKnowledgeBaseMention
        ? flattenKnowledgeBaseTree(knowledgeBaseItems).filter((path) =>
            path.toLowerCase().startsWith(activeKnowledgeBaseMention.query.toLowerCase())
          )
        : [],
    [activeKnowledgeBaseMention, knowledgeBaseItems]
  )

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
        const tree = await window.spacezero.knowledgeBase.getTree()
        if (!current) return
        setKnowledgeBaseItems(tree)
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

  const handleSubmit = ({ text, files }: { text: string; files: PromptInputFile[] }) => {
    setPromptText('')
    onSubmit({
      text,
      files: files.map((item) => item.file),
      modelId: activeModelId
    })
  }

  function selectKnowledgeBaseMention(path: string): void {
    if (!activeKnowledgeBaseMention) return
    setPromptText(`${promptText.slice(0, activeKnowledgeBaseMention.start)}@kb/${path} `)
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
        value={promptText}
        onChange={(event) => setPromptText(event.target.value)}
      />
      {activeKnowledgeBaseMention ? (
        <div
          className="mx-2 max-h-40 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          role="listbox"
          aria-label="Knowledge Base paths"
        >
          {knowledgeBaseMentionState === 'loading' ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading Knowledge Base paths…</p>
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
  )
}

function flattenKnowledgeBaseTree(items: KnowledgeBaseTreeItem[]): string[] {
  return items.flatMap((item) => [
    item.kind === 'folder' ? `${item.relativePath}/` : item.relativePath,
    ...(item.children ? flattenKnowledgeBaseTree(item.children) : [])
  ])
}
