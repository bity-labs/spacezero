import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UpdateRestartControlView } from './update-restart-control'

describe('UpdateRestartControlView', () => {
  it('emits deterministic sidebar update and confirmation intent', () => {
    const onRequestApply = vi.fn()
    const onDialogOpenChange = vi.fn()

    const { rerender } = render(
      <UpdateRestartControlView
        placement="sidebar"
        version="0.1.0-beta.8"
        isApplying={false}
        dialogOpen={false}
        activeWork={null}
        error={null}
        onRequestApply={onRequestApply}
        onDialogOpenChange={onDialogOpenChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restart to update Space Zero' }))
    expect(onRequestApply).toHaveBeenCalledWith(false)

    rerender(
      <UpdateRestartControlView
        placement="sidebar"
        version="0.1.0-beta.8"
        isApplying={false}
        dialogOpen
        activeWork={{ projectSessions: 1, chatContexts: 0, terminalTabs: 2 }}
        error={null}
        onRequestApply={onRequestApply}
        onDialogOpenChange={onDialogOpenChange}
      />
    )

    expect(screen.getByText(/1 active Project Session, 2 active Terminal tabs/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restart and apply update' }))
    expect(onRequestApply).toHaveBeenCalledWith(true)
  })
})
