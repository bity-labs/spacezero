import type { Meta, StoryObj } from '@storybook/react-vite'

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

const meta: Meta<typeof OnboardingScreen> = {
  title: 'Screens/Onboarding/Flow',
  component: OnboardingScreen,
  parameters: { layout: 'fullscreen' },
  args: welcomeOnboardingFixture
}

export default meta

type Story = StoryObj<typeof meta>

export const Welcome: Story = {}
export const LicenseLoading: Story = { args: licenseLoadingOnboardingFixture }
export const LicenseRequired: Story = { args: licenseRequiredOnboardingFixture }
export const LicenseInvalid: Story = { args: invalidLicenseOnboardingFixture }
export const LicenseExpired: Story = { args: expiredLicenseOnboardingFixture }
export const LicenseOfflineGrace: Story = { args: offlineGraceOnboardingFixture }
export const LicenseUnsupportedVersion: Story = { args: unsupportedVersionOnboardingFixture }
export const LicenseActivating: Story = { args: activatingOnboardingFixture }
export const LicenseActivationError: Story = { args: activationErrorOnboardingFixture }
export const GitHubDisconnected: Story = { args: githubDisconnectedOnboardingFixture }
export const GitHubConnected: Story = { args: githubConnectedOnboardingFixture }
export const GitHubError: Story = { args: githubErrorOnboardingFixture }
export const ProjectSetupOffer: Story = { args: projectSetupOfferOnboardingFixture }
export const ProjectSetupBusy: Story = { args: projectSetupBusyOnboardingFixture }
export const ProjectSetupError: Story = { args: projectSetupErrorOnboardingFixture }
