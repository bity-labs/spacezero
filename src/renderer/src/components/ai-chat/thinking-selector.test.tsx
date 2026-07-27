import { fireEvent, render, screen } from '@testing-library/react'

import { getNextThinkingLevel, ThinkingSelector } from './thinking-selector'

describe('ThinkingSelector', () => {
  it('renders the current thinking level', () => {
    render(<ThinkingSelector value="medium" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Thinking: Medium' })).toHaveTextContent('Medium')
  })

  it('cycles to the next thinking level when clicked', () => {
    const handleChange = vi.fn()
    render(<ThinkingSelector value="medium" onChange={handleChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Medium' }))

    expect(handleChange).toHaveBeenCalledWith('high')
  })

  it('wraps from max to off', () => {
    expect(getNextThinkingLevel('max')).toBe('off')
  })

  it('cycles through the provided thinking levels only', () => {
    expect(getNextThinkingLevel('off', ['off', 'low', 'max'])).toBe('low')
    expect(getNextThinkingLevel('low', ['off', 'low', 'max'])).toBe('max')
    expect(getNextThinkingLevel('max', ['off', 'low', 'max'])).toBe('off')
  })

  it('renders Max when it is the current thinking level', () => {
    render(<ThinkingSelector value="max" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Thinking: Max' })).toHaveTextContent('Max')
  })

  it('does not emit changes while disabled', () => {
    const handleChange = vi.fn()
    render(<ThinkingSelector disabled value="low" onChange={handleChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Thinking: Low' }))

    expect(handleChange).not.toHaveBeenCalled()
  })
})
