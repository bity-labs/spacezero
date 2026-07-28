import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OnboardingGate } from './onboarding-gate'

describe('OnboardingGate', () => {
  it('rechecks activation while an already-open app crosses the recheck boundary', async () => {
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

    await waitFor(() => expect(window.spacezero.licenseActivation.getStatus).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'Activate Space Zero' })).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
  })
})
