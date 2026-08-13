import type { AgentChatViewProps } from './agent-chat-view'

const baseFixture = {
  sessionId: 'story-agent-chat',
  status: 'idle',
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
  contentClassName: 'w-full px-6 pb-48 pt-12'
} satisfies Partial<AgentChatViewProps>

export const emptyChatFixture = {
  ...baseFixture,
  messages: [],
  emptyState: (
    <div className="space-y-2 text-center">
      <p className="font-medium text-foreground">Start a conversation</p>
      <p className="text-sm text-muted-foreground">
        Ask the agent to inspect, explain, or change your project.
      </p>
    </div>
  )
} satisfies AgentChatViewProps

export const normalTranscriptFixture = {
  ...baseFixture,
  messages: [
    {
      id: 'normal-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Summarize the current project status.' }]
    },
    {
      id: 'normal-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'The project is ready. Type checking and focused renderer tests are passing.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const streamingResponseFixture = {
  ...baseFixture,
  status: 'running',
  messages: [
    {
      id: 'streaming-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Review the chat component architecture.' }]
    },
    {
      id: 'streaming-assistant',
      role: 'assistant',
      status: 'streaming',
      parts: [
        {
          type: 'text',
          text: 'The renderer keeps the Electron bridge behind an app-connected container while the view…'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const thinkingVisibleFixture = {
  ...baseFixture,
  messages: [
    {
      id: 'thinking-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Where should this renderer component live?' }]
    },
    {
      id: 'thinking-assistant',
      role: 'assistant',
      status: 'complete',
      activityDurationSeconds: 8,
      parts: [
        {
          type: 'thinking',
          text: 'I am checking the feature architecture and existing component ownership before choosing a location.',
          state: 'complete',
          collapsed: false
        },
        {
          type: 'text',
          text: 'This reusable renderer component belongs with the existing global chat components.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const toolCallRunningFixture = {
  ...baseFixture,
  status: 'running',
  messages: [
    {
      id: 'tool-running-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Inspect the renderer chat files.' }]
    },
    {
      id: 'tool-running-assistant',
      role: 'assistant',
      status: 'streaming',
      parts: [
        {
          type: 'tool-call',
          callId: 'read-running',
          toolName: 'read',
          state: 'running',
          input: { path: 'src/renderer/src/components/agent-chat.tsx' },
          defaultExpanded: true
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const toolCallCompletedFixture = {
  ...baseFixture,
  messages: [
    {
      id: 'tool-complete-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Check the type definitions.' }]
    },
    {
      id: 'tool-complete-assistant',
      role: 'assistant',
      status: 'complete',
      activityDurationSeconds: 3,
      parts: [
        {
          type: 'tool-call',
          callId: 'read-complete',
          toolName: 'read',
          state: 'success',
          input: { path: 'src/renderer/src/components/ai-chat/ai-chat.types.ts' },
          output: 'Read 59 lines.',
          defaultExpanded: true
        },
        {
          type: 'text',
          text: 'The chat state types cover text, thinking, tools, and confirmations.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const toolCallFailedFixture = {
  ...baseFixture,
  messages: [
    {
      id: 'tool-failed-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Read the missing design note.' }]
    },
    {
      id: 'tool-failed-assistant',
      role: 'assistant',
      status: 'complete',
      activityDurationSeconds: 2,
      parts: [
        {
          type: 'tool-call',
          callId: 'read-failed',
          toolName: 'read',
          state: 'error',
          input: { path: 'docs/chat-design.md' },
          error: 'File not found: docs/chat-design.md',
          defaultExpanded: true
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const confirmationRequiredFixture = {
  ...baseFixture,
  messages: [
    {
      id: 'confirmation-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Update the workspace settings.' }]
    },
    {
      id: 'confirmation-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'tool-confirmation',
          callId: 'workspace-write-confirmation',
          toolName: 'workspace.write',
          summary: 'Change the workspace default model to Claude Sonnet 4.5.',
          state: 'pending'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const errorStateFixture = {
  ...baseFixture,
  error: 'The agent session disconnected. Reopen the session and try again.',
  messages: [
    {
      id: 'error-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Run the validation checks.' }]
    },
    {
      id: 'error-assistant',
      role: 'assistant',
      status: 'error',
      parts: [{ type: 'text', text: 'The response could not be completed.' }]
    }
  ]
} satisfies AgentChatViewProps
