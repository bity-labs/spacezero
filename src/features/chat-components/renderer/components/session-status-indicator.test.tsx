import { render, screen } from '@testing-library/react'

import { SessionStatusIndicator } from './session-status-indicator'

describe('SessionStatusIndicator', () => {
  it('shows a running session state from props', () => {
    render(<SessionStatusIndicator status="running" />)

    expect(screen.getByRole('status')).toHaveTextContent('Running')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'running')
  })

  it('shows an idle session state from props', () => {
    render(<SessionStatusIndicator status="idle" />)

    expect(screen.getByRole('status')).toHaveTextContent('Idle')
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'idle')
  })
})
