import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { SessionModelSelector } from './session-model-selector'

describe('SessionModelSelector', () => {
  it('shows the selected model and emits selected model ids', () => {
    const onModelChange = vi.fn()
    render(
      <SessionModelSelector
        models={[
          { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic' },
          { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI' }
        ]}
        selectedModelId="claude-sonnet-4.5"
        onModelChange={onModelChange}
      />
    )

    const select = screen.getByLabelText('Session model')
    expect(select).toHaveValue('claude-sonnet-4.5')
    expect(screen.getByRole('option', { name: 'Anthropic · Claude Sonnet 4.5' })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'gpt-5' } })

    expect(onModelChange).toHaveBeenCalledWith('gpt-5')
  })
})
