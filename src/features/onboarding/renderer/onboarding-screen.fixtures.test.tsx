import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  activatingOnboardingFixture,
  activationErrorOnboardingFixture,
  expiredLicenseOnboardingFixture,
  githubConnectedOnboardingFixture,
  githubDisconnectedOnboardingFixture,
  githubErrorOnboardingFixture,
  invalidLicenseOnboardingFixture,
  licenseLoadingOnboardingFixture,
  licenseRequiredOnboardingFixture,
  offlineGraceOnboardingFixture,
  projectSetupBusyOnboardingFixture,
  projectSetupErrorOnboardingFixture,
  projectSetupOfferOnboardingFixture,
  unsupportedVersionOnboardingFixture,
  welcomeOnboardingFixture
} from './onboarding-screen.fixtures'
import { OnboardingScreen } from './onboarding-screen'

describe('OnboardingScreen fixtures', () => {
  it.each([
    ['welcome', welcomeOnboardingFixture, 'Activate Space Zero'],
    ['license loading', licenseLoadingOnboardingFixture, 'Loading License Activation'],
    [
      'license required',
      licenseRequiredOnboardingFixture,
      'Enter a license key to activate Space Zero.'
    ],
    [
      'invalid license',
      invalidLicenseOnboardingFixture,
      'This license key is invalid. Check the key and try again.'
    ],
    [
      'expired license',
      expiredLicenseOnboardingFixture,
      'This license is expired. Renew or reactivate to continue.'
    ],
    [
      'offline grace',
      offlineGraceOnboardingFixture,
      'Offline access is available during the 7-day grace period.'
    ],
    [
      'unsupported version',
      unsupportedVersionOnboardingFixture,
      'This Space Zero build is no longer supported. Update to continue.'
    ],
    ['activating', activatingOnboardingFixture, 'Activating…'],
    [
      'activation error',
      activationErrorOnboardingFixture,
      'Unable to activate Space Zero. Check your connection and retry.'
    ],
    ['GitHub disconnected', githubDisconnectedOnboardingFixture, 'Connect GitHub'],
    ['GitHub connected', githubConnectedOnboardingFixture, '@octocat'],
    [
      'GitHub error',
      githubErrorOnboardingFixture,
      'Unable to read the GitHub connection. Check your connection and try again.'
    ],
    ['Project setup offer', projectSetupOfferOnboardingFixture, 'Set up a GitHub Project?'],
    ['Project setup busy', projectSetupBusyOnboardingFixture, 'Cloning repository… 64%'],
    [
      'Project setup error',
      projectSetupErrorOnboardingFixture,
      'Unable to start the clone. Check repository access and destination, then retry.'
    ]
  ])('renders the %s state without an app runtime', (_name, fixture, expectedText) => {
    render(<OnboardingScreen {...fixture} />)

    expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0)
  })
})
