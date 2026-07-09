import { render, screen } from '@testing-library/react'

import { SessionStatusIndicator } from './session-status-indicator'

describe('SessionStatusIndicator', () => {
  it('renders an idle status dot', () => {
    render(<SessionStatusIndicator status="idle" />)

    expect(screen.getByRole('status', { name: 'Session idle' })).toBeInTheDocument()
  })

  it('renders a running spinner', () => {
    render(<SessionStatusIndicator status="running" />)

    expect(screen.getByRole('status', { name: 'Session running' })).toBeInTheDocument()
  })

  it('supports a custom accessible label', () => {
    render(<SessionStatusIndicator status="running" label="Coding agent running" />)

    expect(screen.getByRole('status', { name: 'Coding agent running' })).toBeInTheDocument()
  })
})
