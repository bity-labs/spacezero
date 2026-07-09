import { fireEvent, render, screen } from '@testing-library/react'

import { ChatInput } from './chat-input'

describe('ChatInput', () => {
  it('submits entered text with Enter and clears the input', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput onSubmit={handleSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Agent prompt' })
    fireEvent.change(input, { target: { value: '  hello agent  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(handleSubmit).toHaveBeenCalledWith('hello agent')
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

    expect(handleSubmit).toHaveBeenCalledWith('run checks')
  })

  it('disables input and submit while a turn is running', () => {
    const handleSubmit = vi.fn()
    render(<ChatInput disabled onSubmit={handleSubmit} />)

    expect(screen.getByRole('textbox', { name: 'Agent prompt' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})
