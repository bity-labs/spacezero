import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OnboardingGate } from './onboarding-gate'

describe('OnboardingGate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rechecks activation while an already-open app crosses the recheck boundary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    window.spacezero.onboarding.getStatus = async () => ({ completed: true })
    window.spacezero.licenseActivation.getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'active',
        canEnterWorkspace: true,
        message: 'Space Zero is activated.',
        recheckAfter: new Date(Date.now() + 10).toISOString()
      })
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'revoked',
        canEnterWorkspace: false,
        message: 'This license was revoked. Reactivate with a valid license.',
        renewalUrl: 'https://spacezero.dev/reactivate'
      })

    render(
      <OnboardingGate>
        <div>Workspace</div>
      </OnboardingGate>
    )

    expect(await screen.findByText('Workspace')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await waitFor(() => expect(window.spacezero.licenseActivation.getStatus).toHaveBeenCalledTimes(3))
    expect(await screen.findByRole('heading', { name: 'Activate Space Zero' })).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
  })
})
