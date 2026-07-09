import { fireEvent, render, screen } from '@testing-library/react'

import { ToolConfirmationCard } from './tool-confirmation-card'

describe('ToolConfirmationCard', () => {
  it('renders a pending approval request and resolves approvals', () => {
    const handleResolve = vi.fn()
    render(
      <ToolConfirmationCard
        callId="call-1"
        toolName="workspace.write"
        summary="Write to workspace settings"
        onResolve={handleResolve}
      />
    )

    expect(screen.getByText('workspace.write requires approval')).toBeInTheDocument()
    expect(screen.getByText('Write to workspace settings')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(handleResolve).toHaveBeenCalledWith('call-1', true)
  })

  it('resolves denials', () => {
    const handleResolve = vi.fn()
    render(
      <ToolConfirmationCard
        callId="call-1"
        toolName="workspace.write"
        summary="Write to workspace settings"
        onResolve={handleResolve}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))

    expect(handleResolve).toHaveBeenCalledWith('call-1', false)
  })

  it('disables actions while resolving', () => {
    render(
      <ToolConfirmationCard
        callId="call-1"
        toolName="workspace.write"
        summary="Write to workspace settings"
        state="resolving"
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeDisabled()
  })

  it('renders approved and denied states', () => {
    const { rerender } = render(
      <ToolConfirmationCard
        callId="call-1"
        toolName="workspace.write"
        summary="Write to workspace settings"
        state="approved"
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByText('Approved')).toBeInTheDocument()

    rerender(
      <ToolConfirmationCard
        callId="call-1"
        toolName="workspace.write"
        summary="Write to workspace settings"
        state="denied"
        onResolve={vi.fn()}
      />
    )

    expect(screen.getByText('Denied')).toBeInTheDocument()
  })
})
