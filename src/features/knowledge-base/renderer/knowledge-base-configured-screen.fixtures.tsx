import { AgentChatView, type AgentChatViewProps } from '@renderer/components/agent-chat-view'

import type { KnowledgeBaseConfiguredScreenProps } from './knowledge-base-configured-screen'

const noOp = (): void => undefined

const knowledgeBaseChatFixture = {
  sessionId: 'knowledge-base-story-session',
  status: 'idle',
  messages: [
    {
      id: 'knowledge-base-user-message',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'What decisions have we recorded for the desktop shell?' }]
    },
    {
      id: 'knowledge-base-assistant-message',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'The Knowledge Base records that renderer views stay pure while privileged behavior remains behind preload and IPC.'
        }
      ]
    }
  ],
  placeholder: 'Ask about your Knowledge Base…',
  models: [
    {
      id: 'anthropic:claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      provider: 'anthropic',
      supportedThinkingLevels: ['off', 'low', 'medium', 'high']
    }
  ],
  selectedModelId: 'anthropic:claude-sonnet-4-5',
  thinkingLevel: 'medium',
  contentClassName: 'w-full px-6 pb-48 pt-12',
  onSubmit: noOp,
  onCommand: noOp,
  onAbort: noOp,
  onModelChange: noOp,
  onThinkingChange: noOp,
  onOpenLink: noOp
} satisfies AgentChatViewProps

const configuredChatContent = <AgentChatView {...knowledgeBaseChatFixture} />

export const configuredKnowledgeBaseFixture = {
  setupWarning: undefined,
  error: null,
  isClearingChat: false,
  children: configuredChatContent
} satisfies KnowledgeBaseConfiguredScreenProps

export const configuredWarningKnowledgeBaseFixture = {
  ...configuredKnowledgeBaseFixture,
  setupWarning:
    'The Knowledge Base is ready, but its Git remote is not configured. Add a remote before pushing changes.'
} satisfies KnowledgeBaseConfiguredScreenProps
