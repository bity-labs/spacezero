import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  confirmationRequiredFixture,
  emptyChatFixture,
  errorStateFixture,
  normalTranscriptFixture,
  streamingResponseFixture,
  thinkingVisibleFixture,
  toolCallCompletedFixture,
  toolCallFailedFixture,
  toolCallRunningFixture
} from './agent-chat-view.fixtures'
import type { AiChatMessage, ChatInputHistoryItem, ChatInputSkill } from './ai-chat'
import { AgentChatView, type AgentChatViewProps } from './agent-chat-view'

const noOp = (): void => undefined

const meta = {
  title: 'Design System/Components/Agent Chat/Complete',
  component: AgentChatView,
  decorators: [
    (Story) => (
      <div className="flex h-[720px] w-[900px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-sm">
        <Story />
      </div>
    )
  ],
  args: {
    ...emptyChatFixture,
    onSubmit: noOp,
    onAbort: noOp,
    onModelChange: noOp,
    onThinkingChange: noOp,
    onAgentDefinitionChange: noOp,
    onToolConfirmationResolve: noOp,
    onOpenLink: noOp
  }
} satisfies Meta<typeof AgentChatView>

export default meta

type Story = StoryObj<typeof meta>

export const EmptyChat: Story = {
  args: emptyChatFixture
}

export const NormalTranscript: Story = {
  args: normalTranscriptFixture
}

export const StreamingResponse: Story = {
  args: streamingResponseFixture
}

export const ThinkingVisible: Story = {
  args: thinkingVisibleFixture
}

export const ToolCallRunning: Story = {
  args: toolCallRunningFixture
}

export const ToolCallCompleted: Story = {
  args: toolCallCompletedFixture
}

export const ToolCallFailed: Story = {
  args: toolCallFailedFixture
}

export const ConfirmationRequired: Story = {
  args: confirmationRequiredFixture
}

export const ErrorState: Story = {
  args: errorStateFixture
}

const resumeHistoryItems = [
  {
    id: 'ctx-architecture',
    initialPrompt: 'Explain the Agent Chat component architecture.',
    createdAt: '2026-08-14T13:01:34.000Z'
  },
  {
    id: 'ctx-storybook',
    initialPrompt: 'Design the Storybook states for prompt suggestions.',
    createdAt: '2026-08-13T09:45:00.000Z'
  },
  {
    id: 'ctx-validation',
    initialPrompt: 'Run validation for the Agent Chat UI changes.',
    createdAt: '2026-08-12T16:20:00.000Z'
  }
] satisfies ChatInputHistoryItem[]

const promptPlaygroundCommands = [
  {
    name: 'clear',
    description: 'Start a fresh Project Session Chat Context.'
  },
  {
    name: 'resume',
    description: 'Continue an older Project Session Chat Context.'
  }
]

const promptPlaygroundSkills = [
  {
    name: 'clarify-with-context',
    description: "Clarify an idea using the project's context, domain language, ADRs, and code.",
    scope: 'project'
  },
  {
    name: 'break-into-issues',
    description: 'Break a PRD, spec, or plan into independently grabbable GitHub issues.',
    scope: 'project'
  },
  {
    name: 'debug',
    description: 'Investigate failing behavior with a disciplined debugging loop.',
    scope: 'user'
  }
] satisfies ChatInputSkill[]

const knowledgeBaseMentionPaths = [
  'README.md',
  'decisions/',
  'decisions/architecture.md',
  'Design Notes/',
  'Design Notes/README.md',
  'projects/space-zero-agent-chat.md'
]

const fileMentionPaths = [
  'src/renderer/src/components/agent-chat-view.tsx',
  'src/renderer/src/components/ai-chat/chat-input.tsx',
  'src/renderer/src/components/ai-chat/prompt-suggestion-menu.tsx',
  'docs/context.md',
  'docs/coding-standards.md'
]

const resumedMessagesByContextId = {
  'ctx-architecture': [
    {
      id: 'ctx-architecture-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Explain the Agent Chat component architecture.' }]
    },
    {
      id: 'ctx-architecture-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'Agent Chat composes ChatTranscript with ChatInput. Prompt suggestions are owned by the input surface.'
        }
      ]
    }
  ],
  'ctx-storybook': [
    {
      id: 'ctx-storybook-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Design the Storybook states for prompt suggestions.' }]
    },
    {
      id: 'ctx-storybook-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'Use item-level stories for command, skill, mention, history, selected, and disabled states, plus a menu-level story for composition.'
        }
      ]
    }
  ],
  'ctx-validation': [
    {
      id: 'ctx-validation-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Run validation for the Agent Chat UI changes.' }]
    },
    {
      id: 'ctx-validation-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [{ type: 'text', text: 'Storybook taxonomy and focused lint checks are passing.' }]
    }
  ]
} satisfies Record<string, AiChatMessage[]>

export const InteractiveResumeCommand: Story = {
  args: {
    ...emptyChatFixture,
    commands: [
      {
        name: 'resume',
        description: 'Continue an older Project Session Chat Context.'
      }
    ]
  },
  render: (args) => <InteractiveResumeCommandStory {...args} />
}

export const InteractiveKnowledgeBaseMentions: Story = {
  args: emptyChatFixture,
  render: (args) => <InteractiveKnowledgeBaseMentionsStory {...args} />
}

export const InteractiveKnowledgeBaseUnconfigured: Story = {
  args: emptyChatFixture,
  render: (args) => (
    <AgentChatView
      {...args}
      loadKnowledgeBaseMentionPaths={async () => ({ state: 'unconfigured' })}
    />
  )
}

export const InteractivePromptSuggestionsPlayground: Story = {
  args: {
    ...emptyChatFixture,
    commands: promptPlaygroundCommands,
    skills: promptPlaygroundSkills,
    emptyState: (
      <div className="space-y-2 text-center">
        <p className="font-medium text-foreground">Prompt suggestion playground</p>
        <p className="text-sm text-muted-foreground">
          Try /res, /clear, /skill:, @, @kb, @chat, and keyboard selection.
        </p>
      </div>
    )
  },
  render: (args) => <InteractivePromptSuggestionsPlaygroundStory {...args} />
}

function InteractiveResumeCommandStory(args: AgentChatViewProps): React.JSX.Element {
  const [historyItems, setHistoryItems] = useState<ChatInputHistoryItem[] | undefined>(undefined)
  const [messages, setMessages] = useState<AiChatMessage[]>(args.messages)

  return (
    <AgentChatView
      {...args}
      messages={messages}
      historyItems={historyItems}
      onCommand={(commandName) => {
        if (commandName === 'resume') setHistoryItems(resumeHistoryItems)
      }}
      onHistoryDismiss={() => setHistoryItems(undefined)}
      onHistorySelect={(historyItemId) => {
        setMessages(resumedMessagesByContextId[historyItemId] ?? args.messages)
        setHistoryItems(undefined)
      }}
    />
  )
}

function InteractiveKnowledgeBaseMentionsStory(args: AgentChatViewProps): React.JSX.Element {
  const [messages, setMessages] = useState<AiChatMessage[]>(args.messages)

  return (
    <AgentChatView
      {...args}
      messages={messages}
      loadKnowledgeBaseMentionPaths={async () => ({
        state: 'ready',
        paths: [...knowledgeBaseMentionPaths]
      })}
      loadFileMentionPaths={async () => ({
        state: 'ready',
        paths: [...fileMentionPaths]
      })}
      onSubmit={(text) => {
        setMessages([
          {
            id: `kb-user-${Date.now()}`,
            role: 'user',
            status: 'complete',
            parts: [{ type: 'text', text }]
          },
          {
            id: `kb-assistant-${Date.now()}`,
            role: 'assistant',
            status: 'complete',
            parts: [
              {
                type: 'text',
                text: 'Storybook captured the submitted prompt above. Use this to verify the @kb mention text after autocomplete.'
              }
            ]
          }
        ])
      }}
    />
  )
}

function InteractivePromptSuggestionsPlaygroundStory(args: AgentChatViewProps): React.JSX.Element {
  const [historyItems, setHistoryItems] = useState<ChatInputHistoryItem[] | undefined>(undefined)
  const [messages, setMessages] = useState<AiChatMessage[]>(args.messages)

  return (
    <AgentChatView
      {...args}
      messages={messages}
      historyItems={historyItems}
      loadKnowledgeBaseMentionPaths={async () => ({
        state: 'ready',
        paths: knowledgeBaseMentionPaths
      })}
      loadFileMentionPaths={async () => ({
        state: 'ready',
        paths: fileMentionPaths
      })}
      onCommand={(commandName) => {
        if (commandName === 'resume') {
          setHistoryItems(resumeHistoryItems)
          return
        }

        if (commandName === 'clear') {
          setHistoryItems(undefined)
          setMessages([])
        }
      }}
      onHistoryDismiss={() => setHistoryItems(undefined)}
      onHistorySelect={(historyItemId) => {
        setMessages(resumedMessagesByContextId[historyItemId] ?? args.messages)
        setHistoryItems(undefined)
      }}
      onSubmit={(text) => {
        setHistoryItems(undefined)
        setMessages([
          {
            id: `playground-user-${Date.now()}`,
            role: 'user',
            status: 'complete',
            parts: [{ type: 'text', text }]
          },
          {
            id: `playground-assistant-${Date.now()}`,
            role: 'assistant',
            status: 'complete',
            parts: [
              {
                type: 'text',
                text: 'Storybook captured the submitted prompt. Use this scenario to verify slash commands, skills, file mentions, and Knowledge Base mentions together.'
              }
            ]
          }
        ])
      }}
    />
  )
}
