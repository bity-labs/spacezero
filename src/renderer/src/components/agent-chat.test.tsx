import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AgentChat } from './agent-chat'
import type { AgentSessionState } from '@shared/agent-protocol'
import type { AvailableModel, ModelDefaults } from '@shared/model-settings'

describe('AgentChat', () => {
  it('aborts a running response when Escape is pressed', () => {
    const handleAbort = vi.fn()

    render(<AgentChat sessionId="session-1" messages={[]} status="running" onAbort={handleAbort} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handleAbort).toHaveBeenCalledOnce()
  })

  it('does not abort idle sessions on Escape', () => {
    const handleAbort = vi.fn()

    render(<AgentChat sessionId="session-1" messages={[]} status="idle" onAbort={handleAbort} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handleAbort).not.toHaveBeenCalled()
  })

  it('hides the chat transcript scrollbar while keeping it scrollable', () => {
    render(<AgentChat sessionId="session-1" messages={[]} />)

    expect(screen.getByLabelText('Conversation')).toHaveClass('overflow-y-auto', 'no-scrollbar')
  })

  it('submits selected file paths as prompt context without reading contents', async () => {
    const handleSubmit = vi.fn()
    const file = new File(['export const answer = 42\n'], 'answer.ts', { type: 'text/typescript' })
    const readText = vi.spyOn(file, 'text')
    render(<AgentChat sessionId="session-1" messages={[]} onSubmit={handleSubmit} />)

    fireEvent.change(screen.getByLabelText('Upload files'), { target: { files: [file] } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'Use this' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() =>
      expect(handleSubmit).toHaveBeenCalledWith(
        'Use this\n\nSelected file context paths:\n- /tmp/answer.ts (text/typescript)\n\nRead these files if you need their contents.',
        undefined
      )
    )
    expect(readText).not.toHaveBeenCalled()
  })

  it('loads Knowledge Base mention paths through the app-connected container', async () => {
    window.spacezero.knowledgeBase.getStatus = async () => ({
      setupState: 'configured',
      rootPath: '/home/builder/SpaceZero/knowledge-base'
    })
    window.spacezero.files.listDirectory = async ({ relativePath }) =>
      relativePath === '' ? [{ name: 'README.md', relativePath: 'README.md', kind: 'file' }] : []

    render(<AgentChat sessionId="session-1" messages={[]} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'Review @kb' }
    })

    expect(await screen.findByRole('option', { name: /README\.md/ })).toBeInTheDocument()
  })

  it('reconciles displayed thinking to the effective runtime state after switching model capabilities', async () => {
    const user = userEvent.setup()
    const availableModels: AvailableModel[] = [
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'max-reasoning',
        modelLabel: 'Max Reasoning',
        supportedThinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
      },
      {
        providerId: 'openai',
        providerLabel: 'OpenAI',
        modelId: 'fast',
        modelLabel: 'Fast Model',
        supportedThinkingLevels: ['off']
      },
      {
        providerId: 'anthropic',
        providerLabel: 'Anthropic',
        modelId: 'limited',
        modelLabel: 'Limited Reasoning',
        supportedThinkingLevels: ['off', 'low']
      }
    ]
    const defaults: ModelDefaults = { defaultThinking: 'medium' }
    const sessionState: AgentSessionState = {
      sessionId: 'session-1',
      projectId: 'project-test',
      cwd: '/tmp/project-test',
      status: 'idle',
      live: true,
      transcriptPath: '/tmp/agent-session-test.jsonl',
      modelProvider: 'anthropic',
      modelId: 'max-reasoning',
      thinkingLevel: 'max'
    }
    const setModel = vi.fn(
      async ({ sessionId, provider, modelId }): Promise<AgentSessionState> => ({
        ...sessionState,
        sessionId,
        modelProvider: provider,
        modelId,
        thinkingLevel: modelId === 'fast' ? 'off' : 'low'
      })
    )
    window.spacezero.agent.getAvailableModels = async () => availableModels
    window.spacezero.settings.getModelDefaults = async () => defaults
    window.spacezero.agent.setModel = setModel

    render(<AgentChat sessionId="session-1" messages={[]} sessionState={sessionState} />)

    expect(await screen.findByRole('button', { name: 'Thinking: Max' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Max Reasoning/i }))
    await user.click(await screen.findByRole('option', { name: /Fast Model/i }))

    await waitFor(() =>
      expect(setModel).toHaveBeenCalledWith({
        sessionId: 'session-1',
        provider: 'openai',
        modelId: 'fast'
      })
    )
    expect(await screen.findByRole('button', { name: 'Thinking: Off' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Fast Model/i }))
    await user.click(await screen.findByRole('option', { name: /Limited Reasoning/i }))

    await waitFor(() =>
      expect(setModel).toHaveBeenLastCalledWith({
        sessionId: 'session-1',
        provider: 'anthropic',
        modelId: 'limited'
      })
    )
    expect(await screen.findByRole('button', { name: 'Thinking: Low' })).toBeInTheDocument()
  })
})
