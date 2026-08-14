import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OnboardingScreen, type OnboardingScreenProps } from './onboarding-screen'

function createProps(overrides: Partial<OnboardingScreenProps> = {}): OnboardingScreenProps {
  return {
    step: 'welcome',
    activation: null,
    licenseKey: '',
    error: null,
    isFinishing: false,
    isActivating: false,
    isProjectSetupBusy: false,
    connectionContent: null,
    projectSetupContent: null,
    onGetStarted: vi.fn(),
    onLicenseKeyChange: vi.fn(),
    onActivate: vi.fn(),
    onOpenRenewal: vi.fn(),
    onOpenUpdate: vi.fn(),
    onContinueAfterConnection: vi.fn(),
    onSkipConnection: vi.fn(),
    onStartProjectSetup: vi.fn(),
    onSkipProjectSetup: vi.fn(),
    onContinueWithoutProject: vi.fn(),
    ...overrides
  }
}

describe('OnboardingScreen', () => {
  it('renders the welcome step and emits the get-started intent', () => {
    const onGetStarted = vi.fn()

    render(<OnboardingScreen {...createProps({ onGetStarted })} />)

    expect(screen.getByRole('heading', { name: 'Activate Space Zero' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(onGetStarted).toHaveBeenCalledOnce()
  })
})
