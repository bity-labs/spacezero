import {
  emptyChatFixture,
  errorStateFixture,
  normalTranscriptFixture,
  streamingResponseFixture
} from '@renderer/components/agent-chat-view.fixtures'
import type { AgentChatViewProps } from '@renderer/components/agent-chat-view'

const projectCommands = [
  { name: 'clear', description: 'Start a fresh Project Session Chat Context.' },
  { name: 'resume', description: 'Continue an older Project Session Chat Context.' }
]

const globalCommands = [
  { name: 'clear', description: 'Start a fresh Global Chat Context.' },
  { name: 'resume', description: 'Continue an older Global Chat Context.' }
]

export const projectSessionReadyFixture = {
  ...normalTranscriptFixture,
  sessionId: 'project-session-chat',
  placeholder: 'Message Space Zero / Storybook coverage…',
  commands: projectCommands
} satisfies AgentChatViewProps

export const projectSessionRunningFixture = {
  ...streamingResponseFixture,
  sessionId: 'project-session-chat',
  placeholder: 'Message Space Zero / Storybook coverage…',
  commands: projectCommands
} satisfies AgentChatViewProps

export const projectSessionErrorFixture = {
  ...errorStateFixture,
  sessionId: 'project-session-chat',
  placeholder: 'Message Space Zero / Storybook coverage…',
  commands: projectCommands
} satisfies AgentChatViewProps

export const projectSessionHistoryFixture = {
  ...projectSessionReadyFixture,
  historyItems: [
    {
      id: 'project-history-review',
      initialPrompt: 'Review the renderer container and pure view boundary.',
      createdAt: '2026-08-12T15:40:00.000Z'
    },
    {
      id: 'project-history-tests',
      initialPrompt: 'Add public-behavior tests for Project Session chat.',
      createdAt: '2026-08-11T09:20:00.000Z'
    }
  ]
} satisfies AgentChatViewProps

export const projectSessionClearedFixture = {
  ...emptyChatFixture,
  sessionId: 'project-session-cleared-chat',
  placeholder: 'Message Space Zero / Storybook coverage…',
  commands: projectCommands,
  emptyState: (
    <p className="text-sm text-muted-foreground">
      Ask the agent to work on this project. Streamed replies appear here.
    </p>
  )
} satisfies AgentChatViewProps

export const projectSessionResumedFixture = {
  ...projectSessionReadyFixture,
  sessionId: 'project-session-resumed-chat',
  messages: [
    {
      id: 'project-resumed-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Continue the Storybook session host work.' }]
    },
    {
      id: 'project-resumed-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'The older Project Session Chat Context is active in the same managed worktree.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const globalChatReadyFixture = {
  ...normalTranscriptFixture,
  sessionId: 'global-chat-context',
  placeholder: 'Ask about Space Zero…',
  commands: globalCommands,
  messages: [
    {
      id: 'global-ready-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'What can you inspect in my workspace?' }]
    },
    {
      id: 'global-ready-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'I can help inspect and operate Space Zero through approved Workspace Tools.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps

export const globalChatRunningFixture = {
  ...streamingResponseFixture,
  sessionId: 'global-chat-context',
  placeholder: 'Ask about Space Zero…',
  commands: globalCommands
} satisfies AgentChatViewProps

export const globalChatErrorFixture = {
  ...errorStateFixture,
  sessionId: 'global-chat-context',
  placeholder: 'Ask about Space Zero…',
  commands: globalCommands
} satisfies AgentChatViewProps

export const globalChatHistoryFixture = {
  ...globalChatReadyFixture,
  historyItems: [
    {
      id: 'global-history-workspace',
      initialPrompt: 'Inspect persistent Browser and Terminal state.',
      createdAt: '2026-08-12T15:40:00.000Z'
    },
    {
      id: 'global-history-projects',
      initialPrompt: 'Summarize my registered projects.',
      createdAt: '2026-08-10T10:15:00.000Z'
    }
  ]
} satisfies AgentChatViewProps

export const globalChatClearedFixture = {
  ...emptyChatFixture,
  sessionId: 'global-chat-cleared-context',
  placeholder: 'Ask about Space Zero…',
  commands: globalCommands,
  emptyState: (
    <p className="text-sm text-muted-foreground">
      Ask the workspace agent about Space Zero. Streamed replies appear here.
    </p>
  )
} satisfies AgentChatViewProps

export const globalChatResumedFixture = {
  ...globalChatReadyFixture,
  sessionId: 'global-chat-resumed-context',
  messages: [
    {
      id: 'global-resumed-user',
      role: 'user',
      status: 'complete',
      parts: [{ type: 'text', text: 'Continue checking my workspace status.' }]
    },
    {
      id: 'global-resumed-assistant',
      role: 'assistant',
      status: 'complete',
      parts: [
        {
          type: 'text',
          text: 'The selected Global Chat Context is current again with its earlier transcript.'
        }
      ]
    }
  ]
} satisfies AgentChatViewProps
