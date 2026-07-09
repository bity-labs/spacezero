import { fireEvent, render, screen } from '@testing-library/react'

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

  it('disables input and submit while a turn is running', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput status="streaming" onSubmit={handleSubmit} />)

    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
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
})
