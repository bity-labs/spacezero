import type { AiChatMessage, AiChatMessagePart } from '@renderer/components/ai-chat'

import type {
  AgentAssistantContent,
  AgentAssistantMessage,
  AgentSessionProjectionEvent,
  AgentTextContent,
  AgentThreadSnapshot,
  AgentToolConfirmationRequest,
  AgentToolExecutionState,
  AgentToolResultMessage,
  AgentTranscriptMessage,
  AgentUserContent,
  AgentUserMessage
} from '../../../shared/agent-session-projection.model'
import type { AgentSessionId, AgentSessionStatus } from '../../../shared/agent-protocol'

export type AgentSessionProjectionState = {
  sessionId: AgentSessionId
  messages: readonly AgentTranscriptMessage[]
  streamingMessageIndex: number | undefined
  toolExecutions: Readonly<Record<string, AgentToolExecutionState>>
  toolConfirmationRequests: readonly AgentToolConfirmationRequest[]
  status: AgentSessionStatus
  lastError: string | undefined
  lastSeq: number
}

export function createAgentSessionProjectionState(
  sessionId: AgentSessionId
): AgentSessionProjectionState {
  return {
    sessionId,
    messages: [],
    streamingMessageIndex: undefined,
    toolExecutions: {},
    toolConfirmationRequests: [],
    status: 'idle',
    lastError: undefined,
    lastSeq: 0
  }
}

export function reduceAgentSessionProjectionState(
  state: AgentSessionProjectionState,
  event: AgentSessionProjectionEvent
): AgentSessionProjectionState {
  if (event.sessionId !== state.sessionId) return state
  if (event.seq <= state.lastSeq) return state

  const stamp = (next: AgentSessionProjectionState): AgentSessionProjectionState => ({
    ...next,
    lastSeq: Math.max(state.lastSeq, event.seq)
  })

  switch (event.type) {
    case 'snapshot':
      return stamp(applySnapshot(state, event.snapshot))
    case 'agent_start':
      return stamp({ ...state, status: 'running', lastError: undefined })
    case 'agent_end':
      return stamp({ ...state, status: 'idle', streamingMessageIndex: undefined })
    case 'message_start': {
      const messages = [...state.messages, event.message]
      return stamp({
        ...state,
        messages,
        streamingMessageIndex: isAssistantMessage(event.message)
          ? messages.length - 1
          : state.streamingMessageIndex
      })
    }
    case 'message_update': {
      if (
        state.streamingMessageIndex !== undefined &&
        state.streamingMessageIndex < state.messages.length
      ) {
        return stamp({
          ...state,
          messages: replaceAt(state.messages, state.streamingMessageIndex, event.message)
        })
      }

      const messages = [...state.messages, event.message]
      return stamp({
        ...state,
        messages,
        streamingMessageIndex: isAssistantMessage(event.message)
          ? messages.length - 1
          : state.streamingMessageIndex
      })
    }
    case 'message_end': {
      if (
        state.streamingMessageIndex !== undefined &&
        state.streamingMessageIndex < state.messages.length
      ) {
        return stamp({
          ...state,
          messages: replaceAt(state.messages, state.streamingMessageIndex, event.message),
          streamingMessageIndex: undefined
        })
      }

      return stamp({ ...state, streamingMessageIndex: undefined })
    }
    case 'tool_execution_start':
      return stamp(
        upsertToolExecution(state, event.toolCallId, {
          toolName: event.toolName,
          args: event.args,
          status: 'running'
        })
      )
    case 'tool_execution_update':
      return stamp(
        upsertToolExecution(state, event.toolCallId, {
          ...(event.toolName ? { toolName: event.toolName } : {}),
          partialResult: event.partialResult,
          status: 'running'
        })
      )
    case 'tool_execution_end':
      return stamp(
        upsertToolExecution(state, event.toolCallId, {
          partialResult: event.result,
          status: event.isError ? 'error' : 'complete'
        })
      )
    case 'tool_confirmation_request': {
      const existing = state.toolConfirmationRequests.some(
        (request) => request.callId === event.request.callId
      )
      return stamp({
        ...state,
        toolConfirmationRequests: existing
          ? state.toolConfirmationRequests
          : [...state.toolConfirmationRequests, event.request]
      })
    }
    case 'tool_confirmation_resolved':
      return stamp({
        ...state,
        toolConfirmationRequests: state.toolConfirmationRequests.filter(
          (request) => request.callId !== event.callId
        )
      })
    case 'error':
      return stamp({ ...state, status: 'idle', lastError: event.error })
  }
}

export function projectAgentSessionMessages(
  state: AgentSessionProjectionState
): AiChatMessage[] {
  const toolResults = buildToolResultMap(state.messages)
  const messages: AiChatMessage[] = []
  let group: AssistantGroup | undefined

  const flush = (isLast: boolean): void => {
    if (!group) return
    messages.push(buildAssistantMessage(group, state, isLast))
    group = undefined
  }

  state.messages.forEach((message, index) => {
    const isLast = index === state.messages.length - 1

    if (isUserMessage(message)) {
      flush(false)
      messages.push({
        id: projectedMessageId(index),
        role: 'user',
        createdAt: createdAtOf(message.timestamp),
        parts: projectUserContent(message.content)
      })
      return
    }

    if (isAssistantMessage(message)) {
      if (!group) {
        group = {
          firstIndex: index,
          createdAt: createdAtOf(message.timestamp),
          firstTimestamp: message.timestamp,
          lastTimestamp: message.timestamp,
          parts: [],
          lastAssistant: message
        }
      }
      projectAssistantInto(group, message, state, toolResults)
      if (isLast) flush(true)
      return
    }

    if (isToolResultMessage(message)) {
      if (group) group.lastTimestamp = message.timestamp
      return
    }

    flush(false)
  })

  flush(true)
  return messages
}

function applySnapshot(
  state: AgentSessionProjectionState,
  snapshot: AgentThreadSnapshot
): AgentSessionProjectionState {
  return {
    ...state,
    messages: snapshot.messages,
    streamingMessageIndex: undefined,
    toolExecutions: {},
    toolConfirmationRequests: snapshot.toolConfirmationRequests ?? [],
    status: snapshot.status,
    lastError: snapshot.lastError
  }
}

function upsertToolExecution(
  state: AgentSessionProjectionState,
  toolCallId: string,
  patch: Partial<Omit<AgentToolExecutionState, 'toolCallId' | 'status'>> & {
    status?: AgentToolExecutionState['status']
  }
): AgentSessionProjectionState {
  const existing = state.toolExecutions[toolCallId]

  return {
    ...state,
    toolExecutions: {
      ...state.toolExecutions,
      [toolCallId]: {
        ...existing,
        ...patch,
        toolCallId,
        status: patch.status ?? existing?.status ?? 'running'
      }
    }
  }
}

function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  const next = items.slice()
  next[index] = value
  return next
}

type AssistantGroup = {
  firstIndex: number
  createdAt: string | undefined
  firstTimestamp: number | undefined
  lastTimestamp: number | undefined
  parts: AiChatMessagePart[]
  lastAssistant: AgentAssistantMessage
}

function projectAssistantInto(
  group: AssistantGroup,
  message: AgentAssistantMessage,
  state: AgentSessionProjectionState,
  toolResults: Map<string, ToolResultProjection>
): void {
  group.lastAssistant = message
  group.lastTimestamp = message.timestamp

  if (message.errorMessage) {
    group.parts.push({ type: 'text', text: message.errorMessage })
  }

  for (const part of message.content) {
    if (part.type === 'text') {
      group.parts.push({ type: 'text', text: part.text })
      continue
    }

    if (part.type === 'thinking') {
      group.parts.push({
        type: 'thinking',
        text: part.redacted ? '[reasoning redacted]' : thinkingDisplayText(part),
        state: state.status === 'running' ? 'streaming' : 'complete',
        collapsed: true
      })
      continue
    }

    const result = toolResults.get(part.id)
    const live = state.toolExecutions[part.id]
    const confirmation = state.toolConfirmationRequests.find((request) => request.callId === part.id)
    const liveOutput =
      live?.partialResult !== undefined ? extractResultText(live.partialResult) ?? live.partialResult : undefined

    group.parts.push({
      type: 'tool-call',
      callId: part.id,
      toolName: part.name,
      state: toolCallState(result, live, confirmation),
      input: part.arguments,
      ...(result?.output !== undefined ? { output: result.output } : {}),
      ...(liveOutput !== undefined && result?.output === undefined ? { output: liveOutput } : {}),
      ...(result?.isError ? { error: result.output ?? 'Tool call failed' } : {})
    })

    if (confirmation) {
      group.parts.push({
        type: 'tool-confirmation',
        callId: confirmation.callId,
        toolName: confirmation.toolName,
        summary: confirmation.summary,
        state: 'pending'
      })
    }
  }
}

function thinkingDisplayText(part: Extract<AgentAssistantContent, { type: 'thinking' }>): string {
  if (part.thinking.trim().length > 0) return part.thinking

  if (part.thinkingSignature) {
    const fromSignature = extractThinkingSignatureText(part.thinkingSignature)
    if (fromSignature) return fromSignature
  }

  return part.thinking
}

function extractThinkingSignatureText(signature: string): string | undefined {
  try {
    const parsed = JSON.parse(signature) as unknown
    return extractThinkingSummaryText(parsed) ?? extractThinkingContentText(parsed)
  } catch {
    return undefined
  }
}

function extractThinkingSummaryText(value: unknown): string | undefined {
  const summary = (value as { summary?: unknown } | undefined)?.summary
  if (!Array.isArray(summary)) return undefined

  const text = summary
    .map((entry) => (typeof (entry as { text?: unknown }).text === 'string' ? (entry as { text: string }).text : ''))
    .filter(Boolean)
    .join('\n\n')

  return text.trim().length > 0 ? text : undefined
}

function extractThinkingContentText(value: unknown): string | undefined {
  const content = (value as { content?: unknown } | undefined)?.content
  if (!Array.isArray(content)) return undefined

  const text = content
    .map((entry) => (typeof (entry as { text?: unknown }).text === 'string' ? (entry as { text: string }).text : ''))
    .filter(Boolean)
    .join('\n\n')

  return text.trim().length > 0 ? text : undefined
}

function buildAssistantMessage(
  group: AssistantGroup,
  state: AgentSessionProjectionState,
  isLastMessageInTranscript: boolean
): AiChatMessage {
  const status = assistantStatus(group, state, isLastMessageInTranscript)

  return {
    id: projectedMessageId(group.firstIndex),
    role: 'assistant',
    createdAt: group.createdAt,
    status,
    ...(status !== 'streaming' && hasAssistantActivityParts(group)
      ? { activityDurationSeconds: assistantActivityDuration(group) }
      : {}),
    parts: group.parts
  }
}

function assistantActivityDuration(group: AssistantGroup): number | undefined {
  if (group.firstTimestamp === undefined || group.lastTimestamp === undefined) return undefined

  return Math.max(1, Math.ceil((group.lastTimestamp - group.firstTimestamp) / 1000))
}

function hasAssistantActivityParts(group: AssistantGroup): boolean {
  return group.parts.some((part) => part.type === 'thinking' || part.type === 'tool-call')
}

function assistantStatus(
  group: AssistantGroup,
  state: AgentSessionProjectionState,
  isLastMessageInTranscript: boolean
): 'streaming' | 'complete' | 'error' {
  if (group.lastAssistant.stopReason === 'error') return 'error'
  if (state.status === 'running' && isLastMessageInTranscript) return 'streaming'
  return 'complete'
}

function toolCallState(
  result: ToolResultProjection | undefined,
  live: AgentToolExecutionState | undefined,
  confirmation: AgentToolConfirmationRequest | undefined
): 'pending' | 'running' | 'success' | 'error' {
  if (confirmation) return 'running'
  if (result) return result.isError ? 'error' : 'success'
  if (live) return live.status === 'complete' ? 'success' : live.status
  return 'pending'
}

type ToolResultProjection = {
  output: string | undefined
  isError: boolean
}

function buildToolResultMap(messages: readonly AgentTranscriptMessage[]): Map<string, ToolResultProjection> {
  const results = new Map<string, ToolResultProjection>()

  for (const message of messages) {
    if (!isToolResultMessage(message)) continue
    results.set(message.toolCallId, {
      output: extractResultText({ content: message.content }),
      isError: message.isError
    })
  }

  return results
}

function projectUserContent(content: string | AgentUserContent[]): AiChatMessagePart[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]

  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text }
    return { type: 'text', text: `[image: ${part.mimeType}]` }
  })
}

function extractResultText(value: unknown): string | undefined {
  const content = (value as { content?: unknown } | undefined)?.content
  if (!Array.isArray(content)) return undefined

  const text = content
    .filter(isTextContent)
    .map((part) => part.text)
    .join('')

  return text.length > 0 ? text : undefined
}

function isTextContent(value: unknown): value is AgentTextContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'text' &&
    typeof (value as { text?: unknown }).text === 'string'
  )
}

function isUserMessage(message: AgentTranscriptMessage): message is AgentUserMessage {
  return message.role === 'user'
}

function isAssistantMessage(message: AgentTranscriptMessage | undefined): message is AgentAssistantMessage {
  return message?.role === 'assistant' && Array.isArray((message as AgentAssistantMessage).content)
}

function isToolResultMessage(message: AgentTranscriptMessage): message is AgentToolResultMessage {
  return message.role === 'toolResult'
}

function projectedMessageId(index: number): string {
  return `agent-msg:${index}`
}

function createdAtOf(timestamp: number | undefined): string | undefined {
  return typeof timestamp === 'number' ? new Date(timestamp).toISOString() : undefined
}
