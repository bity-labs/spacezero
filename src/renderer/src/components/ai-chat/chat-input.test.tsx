import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatInput } from './chat-input'

describe('ChatInput', () => {
  it('submits entered text with Enter and clears the input', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '  hello agent  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'hello agent',
      files: [],
      modelId: undefined
    })
    expect(input).toHaveValue('')
  })

  it('keeps a newline on Shift+Enter without submitting', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(handleSubmit).not.toHaveBeenCalled()
    expect(input).toHaveValue('hello')
  })

  it('discovers skills from slash commands and submits the native Pi command', () => {
    const handleSubmit = vi.fn()
    render(
      <ChatInput
        skills={[
          {
            name: 'code-review',
            description: 'Review code changes.',
            scope: 'spacezero'
          },
          {
            name: 'debug',
            description: 'Investigate a failing behavior.',
            scope: 'project'
          }
        ]}
        onSubmit={handleSubmit}
      />
    )

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '/' } })

    expect(screen.getByRole('option', { name: /\/skill:code-review/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /\/skill:debug/ })).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('/skill:debug')
    expect(handleSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith({
      text: '/skill:debug',
      files: [],
      modelId: undefined
    })
  })

  it('submits entered text with the submit button', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'run checks' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(handleSubmit).toHaveBeenCalledWith({ text: 'run checks', files: [], modelId: undefined })
  })

  it('includes attachments and selected model in submitted input', () => {
    const handleSubmit = vi.fn()
    const file = new File(['hello'], 'context.txt', { type: 'text/plain' })
    render(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onSubmit={handleSubmit}
      />
    )

    fireEvent.change(screen.getByLabelText('Upload files'), { target: { files: [file] } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'use this context' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'use this context',
      files: [file],
      modelId: 'sonnet'
    })
  })

  it('disables input and renders a stop button while a turn is running', () => {
    const handleSubmit = vi.fn()
    const handleAbort = vi.fn()
    render(<ChatInput status="streaming" onSubmit={handleSubmit} onAbort={handleAbort} />)

    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }))

    expect(handleAbort).toHaveBeenCalledOnce()
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('renders thinking selection next to composer tools', () => {
    const handleThinkingChange = vi.fn()
    render(
      <ChatInput
        thinkingLevel="medium"
        onThinkingChange={handleThinkingChange}
        onSubmit={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Medium' }))

    expect(handleThinkingChange).toHaveBeenCalledWith('high')
  })

  it('selects a model via keyboard when the selector is open', async () => {
    const handleModelChange = vi.fn()
    render(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onModelChange={handleModelChange}
        onSubmit={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Claude Sonnet/i }))
    await userEvent.keyboard('Claude')
    await userEvent.keyboard('{Enter}')

    expect(handleModelChange).toHaveBeenCalledWith('sonnet')
  })

  it('falls back to the first available model when models arrive after mount', () => {
    const handleSubmit = vi.fn()
    const { rerender } = render(<ChatInput models={[]} onSubmit={handleSubmit} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'hello' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(handleSubmit).toHaveBeenCalledWith({ text: 'hello', files: [], modelId: undefined })

    rerender(
      <ChatInput
        models={[{ id: 'sonnet', label: 'Claude Sonnet', provider: 'anthropic' }]}
        onSubmit={handleSubmit}
      />
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent prompt' }), {
      target: { value: 'hello again' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(handleSubmit).toHaveBeenCalledWith({
      text: 'hello again',
      files: [],
      modelId: 'sonnet'
    })
  })
})
