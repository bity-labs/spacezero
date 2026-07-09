import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { SessionThinkingSelector } from './session-thinking-selector'

describe('SessionThinkingSelector', () => {
  it('lists thinking levels, shows selected level, and emits changes', () => {
    const onThinkingChange = vi.fn()
    render(<SessionThinkingSelector selectedLevel="medium" onThinkingChange={onThinkingChange} />)

    const select = screen.getByLabelText('Session thinking level')
    expect(select).toHaveValue('medium')
    ;['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].forEach((level) => {
      expect(screen.getByRole('option', { name: level })).toBeInTheDocument()
    })

    fireEvent.change(select, { target: { value: 'high' } })

    expect(onThinkingChange).toHaveBeenCalledWith('high')
  })
})
