import type { Meta, StoryObj } from '@storybook/react-vite'

import { AgentChatView, type AgentChatViewProps } from '@renderer/components/agent-chat-view'
import {
  globalChatClearedFixture,
  globalChatErrorFixture,
  globalChatHistoryFixture,
  globalChatReadyFixture,
  globalChatResumedFixture,
  globalChatRunningFixture
} from './session-host-screen.fixtures'
import { SessionHostScreen } from './session-host-screen'

const noOp = (): void => undefined

const meta = {
  title: 'Features/Sessions/Screens/Global Chat',
  component: SessionHostScreen,
  decorators: [
    (Story) => (
      <div className="flex h-[720px] w-[900px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-background shadow-sm">
        <Story />
      </div>
    )
  ],
  args: {
    label: 'Global Chat',
    state: { kind: 'loading', message: 'Opening Chat…' }
  }
} satisfies Meta<typeof SessionHostScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Opening: Story = {}

export const RestoringAgentSession: Story = {
  args: {
    state: { kind: 'loading', message: 'Restoring agent Session…' }
  }
}

export const ReadyIdle: Story = {
  render: () => renderGlobalChat(globalChatReadyFixture)
}

export const Running: Story = {
  render: () => renderGlobalChat(globalChatRunningFixture)
}

export const Error: Story = {
  render: () =>
    renderGlobalChat(
      globalChatErrorFixture,
      'Unable to resume Chat. Your previous chat is still current.'
    )
}

export const HistoryOpen: Story = {
  render: () => renderGlobalChat(globalChatHistoryFixture)
}

export const ClearedChatContext: Story = {
  render: () => renderGlobalChat(globalChatClearedFixture)
}

export const ResumedChatContext: Story = {
  render: () => renderGlobalChat(globalChatResumedFixture)
}

function renderGlobalChat(chatProps: AgentChatViewProps, alert?: string): React.JSX.Element {
  return (
    <SessionHostScreen
      label="Global Chat"
      state={{
        kind: 'ready',
        alert,
        content: (
          <AgentChatView
            {...chatProps}
            onSubmit={noOp}
            onCommand={noOp}
            onHistorySelect={noOp}
            onHistoryDismiss={noOp}
            onAbort={noOp}
            onModelChange={noOp}
            onThinkingChange={noOp}
            onToolConfirmationResolve={noOp}
            onOpenLink={noOp}
          />
        )
      }}
    />
  )
}
