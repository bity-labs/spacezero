import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ModelSelector } from './model-selector'
import { SessionStatusIndicator } from './session-status-indicator'
import { ThinkingSelector } from './thinking-selector'

describe('AI chat selectors and status', () => {
  it('shows the selected model and emits selected model objects', () => {
    const onSelect = vi.fn()
    render(
      <ModelSelector
        models={[
          { id: 'anthropic:claude-sonnet-4.5', provider: 'Anthropic', modelId: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
          { id: 'openai:gpt-5', provider: 'OpenAI', modelId: 'gpt-5', label: 'GPT-5' }
        ]}
        selectedModelId="anthropic:claude-sonnet-4.5"
        onSelect={onSelect}
      />
    )

    expect(screen.getByRole('button', { name: 'Session model' })).toHaveTextContent('Claude Sonnet 4.5')
    fireEvent.click(screen.getByRole('button', { name: 'Session model' }))
    fireEvent.click(screen.getByRole('option', { name: /OpenAI · gpt-5/ }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai:gpt-5' }))
  })

  it('lists thinking levels and emits changes', () => {
    const onChange = vi.fn()
    render(<ThinkingSelector value="medium" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Session thinking level' }))
    expect(screen.getByRole('option', { name: 'high' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'high' }))

    expect(onChange).toHaveBeenCalledWith('high')
  })

  it('shows running and idle session state from props', () => {
    const { rerender } = render(<SessionStatusIndicator status="running" />)

    expect(screen.getByRole('status')).toHaveTextContent('Running')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'running')

    rerender(<SessionStatusIndicator status="idle" showLabel={false} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Idle')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
  })
})
