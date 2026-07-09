import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { ToolConfirmationCard } from './tool-confirmation-card'

describe('ToolConfirmationCard', () => {
  it('renders pending confirmation inline and resolves by call id', () => {
    const onResolve = vi.fn()
    render(
      <ToolConfirmationCard
        request={{ callId: 'call-1', toolName: 'workspace.openProject', summary: 'Open ~/ws/dev/spacezero' }}
        onResolve={onResolve}
      />
    )

    expect(screen.getByText('Approval needed')).toBeInTheDocument()
    expect(screen.getByText('workspace.openProject')).toBeInTheDocument()
    expect(screen.getByText('Open ~/ws/dev/spacezero')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve tool use' }))
    expect(onResolve).toHaveBeenCalledWith({ callId: 'call-1', approved: true })

    fireEvent.click(screen.getByRole('button', { name: 'Deny tool use' }))
    expect(onResolve).toHaveBeenCalledWith({ callId: 'call-1', approved: false })
  })

  it('shows answered states and disables actions', () => {
    render(
      <ToolConfirmationCard
        request={{ callId: 'call-1', toolName: 'bash', summary: 'Run tests', status: 'approved' }}
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve tool use' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deny tool use' })).toBeDisabled()
  })
})
