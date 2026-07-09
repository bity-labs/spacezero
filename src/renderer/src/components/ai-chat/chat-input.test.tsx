import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ChatInput } from './chat-input'

describe('ChatInput', () => {
  it('submits entered text with the button and clears the textarea', () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(onSubmit).toHaveBeenCalledWith('Ship it')
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })

  it('submits with Enter but allows Shift+Enter for new lines', () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)

    const textarea = screen.getByLabelText('Message')
    fireEvent.change(textarea, { target: { value: 'Hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' })

    expect(onSubmit).toHaveBeenCalledWith('Hello')
  })

  it('disables input and submit while running', () => {
    render(<ChatInput onSubmit={vi.fn()} disabled />)

    expect(screen.getByLabelText('Message')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})
