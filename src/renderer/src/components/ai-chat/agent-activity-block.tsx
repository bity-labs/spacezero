import { BrainIcon, CaretDownIcon, CheckCircle, Clock, Wrench, XCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { isValidElement, useEffect, useRef, useState } from 'react'

import { Badge } from '@renderer/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Shimmer } from '@renderer/components/ui/shimmer'
import { cn } from '@renderer/lib/utils'

import type { AiChatThinkingPart, AiChatToolCallPart } from './ai-chat.types'

export type AgentActivityPart = AiChatThinkingPart | AiChatToolCallPart

export type AgentActivityBlockProps = {
  parts: AgentActivityPart[]
  durationSeconds?: number
}

export function AgentActivityBlock({ parts, durationSeconds }: AgentActivityBlockProps) {
  const toolCount = parts.filter(isToolCallPart).length
  const hasActiveWork = parts.some(isActivePart)
  const hasError = parts.some((part) => isToolCallPart(part) && part.state === 'error')
  const measuredElapsedSeconds = useAgentActivityElapsedSeconds(hasActiveWork)
  const elapsedSeconds = hasActiveWork ? measuredElapsedSeconds : (durationSeconds ?? measuredElapsedSeconds)

  if (parts.length === 0) return null

  return (
    <Collapsible className="group/activity not-prose my-3 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground transition-colors hover:text-foreground">
        <ActivityIcon active={hasActiveWork} error={hasError} />
        <AgentActivityTitle
          active={hasActiveWork}
          elapsedSeconds={elapsedSeconds}
          stepCount={parts.length}
          toolCount={toolCount}
        />
        <CaretDownIcon className="ml-auto size-4 shrink-0 transition-transform group-data-[state=open]/activity:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {parts.map((part, index) =>
          isToolCallPart(part) ? (
            <ToolActivityRow key={`${part.callId}-${index}`} part={part} />
          ) : (
            <ThinkingActivityRow key={`thinking-${index}`} part={part} index={index} />
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function AgentActivityTitle({
  active,
  elapsedSeconds,
  stepCount,
  toolCount
}: {
  active: boolean
  elapsedSeconds: number
  stepCount: number
  toolCount: number
}) {
  if (active) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <Shimmer as="span" className="font-medium" duration={1.2}>
          Thinking
        </Shimmer>
        <span className="text-xs text-muted-foreground">· {formatElapsed(elapsedSeconds)}</span>
      </span>
    )
  }

  return (
    <span className="min-w-0 truncate font-medium text-foreground/90">
      Thought for {formatElapsed(elapsedSeconds)} · {stepCount} {stepCount === 1 ? 'step' : 'steps'}
      {toolCount > 0 ? ` · ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : ''}
    </span>
  )
}

function useAgentActivityElapsedSeconds(active: boolean): number {
  const startedAtRef = useRef<number | undefined>(undefined)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!active) return undefined

    startedAtRef.current ??= Date.now()

    const updateElapsed = () => {
      const startedAt = startedAtRef.current ?? Date.now()
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }

    updateElapsed()
    const interval = window.setInterval(updateElapsed, 1000)
    return () => window.clearInterval(interval)
  }, [active])

  return elapsedSeconds
}

function ThinkingActivityRow({ part, index }: { part: AiChatThinkingPart; index: number }) {
  const isStreaming = part.state === 'streaming'
  const text = part.text.trim()
  const hasText = text.length > 0
  const title = hasText
    ? firstThinkingLine(text)
    : isStreaming
      ? 'Thinking'
      : index === 0
        ? 'Thought for a moment'
        : 'Thought step'

  return (
    <Collapsible className="group/row" defaultOpen={part.collapsed === false}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground transition-colors hover:text-foreground">
        <CaretDownIcon className="size-3 shrink-0 transition-transform group-data-[state=open]/row:rotate-180" />
        <BrainIcon className="size-4 shrink-0" />
        <span className="truncate">{title}</span>
        {isStreaming ? <ActivityStatusBadge active>Streaming</ActivityStatusBadge> : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-[1.125rem] border-l border-border/70 pb-1 pl-6 text-muted-foreground">
        {hasText ? (
          <div className="whitespace-pre-wrap break-words leading-6">{part.text}</div>
        ) : (
          <div className="italic text-muted-foreground/70">
            {isStreaming ? 'Waiting for thinking…' : 'No thinking summary was provided by the model.'}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolActivityRow({ part }: { part: AiChatToolCallPart }) {
  const defaultOpen = part.defaultExpanded ?? false

  return (
    <Collapsible className="group/row" defaultOpen={defaultOpen} data-call-id={part.callId}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-1 text-left text-muted-foreground transition-colors hover:text-foreground">
        <CaretDownIcon className="size-3 shrink-0 transition-transform group-data-[state=open]/row:rotate-180" />
        <Wrench className="size-4 shrink-0" />
        <span className="truncate text-foreground/85">{part.toolName}</span>
        <ToolStatusBadge state={part.state} />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-[1.125rem] space-y-3 border-l border-border/70 pb-1 pl-6">
        <CompactValue label="Parameters" value={part.input} />
        <CompactValue label={part.error ? 'Error' : 'Result'} value={part.error ?? part.output} error={Boolean(part.error)} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function CompactValue({ label, value, error = false }: { label: string; value: unknown; error?: boolean }) {
  if (value === undefined || value === '') return null

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">{label}</div>
      <div
        className={cn(
          'overflow-x-auto rounded-md border border-border/60 bg-background/40 p-2 text-xs',
          error && 'border-destructive/30 bg-destructive/10 text-destructive'
        )}
      >
        {isValidElement(value) ? value : <pre className="whitespace-pre-wrap">{formatValue(value)}</pre>}
      </div>
    </div>
  )
}

function ActivityIcon({ active, error }: { active: boolean; error: boolean }) {
  if (error) return <XCircle className="size-4 shrink-0 text-destructive" />
  if (active) return <Clock className="size-4 shrink-0 animate-pulse text-muted-foreground" />
  return <CheckCircle className="size-4 shrink-0 text-muted-foreground" />
}

function ToolStatusBadge({ state }: { state: AiChatToolCallPart['state'] }) {
  if (state === 'pending' || state === 'success') return null

  const content: Record<'running' | 'error', { label: string; icon: ReactNode }> = {
    running: { label: 'Running', icon: <Clock className="size-3 animate-pulse" /> },
    error: { label: 'Error', icon: <XCircle className="size-3 text-red-600" /> }
  }

  return (
    <ActivityStatusBadge error={state === 'error'} active={state === 'running'}>
      {content[state].icon}
      {content[state].label}
    </ActivityStatusBadge>
  )
}

function ActivityStatusBadge({
  children,
  active = false,
  error = false
}: {
  children: ReactNode
  active?: boolean
  error?: boolean
}) {
  return (
    <Badge
      className={cn(
        'h-5 gap-1 rounded-full px-2 text-xs',
        active && 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
        error && 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
      variant="secondary"
    >
      {children}
    </Badge>
  )
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function firstThinkingLine(text: string): string {
  return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? 'Thought step'
}

function formatElapsed(seconds: number): string {
  if (seconds < 1) return 'a moment'
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`
}

function isToolCallPart(part: AgentActivityPart): part is AiChatToolCallPart {
  return part.type === 'tool-call'
}

function isActivePart(part: AgentActivityPart): boolean {
  if (part.type === 'thinking') return part.state === 'streaming'
  return part.state === 'running'
}
