import type { LicenseActivationStatus } from '../../license-activation/shared'
import {
  connectedGitHubAccountFixture,
  disconnectedGitHubAccountFixture,
  errorGitHubAccountFixture
} from '../../github/renderer/components/github-account-settings-screen.fixtures'
import { GitHubAccountSettingsScreen } from '../../github/renderer/components/github-account-settings-screen'
import { repositoryOptionsFixture } from '../../github/renderer/components/github-screens.fixtures'
import {
  RepositorySetupView,
  type RepositorySetupViewProps
} from '../../github/renderer/components/repository-setup-view'
import type { OnboardingScreenProps } from './onboarding-screen'

const noOp = (): void => undefined

const baseOnboardingFixture = {
  step: 'welcome',
  activation: null,
  licenseKey: '',
  error: null,
  isFinishing: false,
  isActivating: false,
  isProjectSetupBusy: false,
  connectionContent: null,
  projectSetupContent: null,
  onGetStarted: noOp,
  onLicenseKeyChange: noOp,
  onActivate: noOp,
  onOpenRenewal: noOp,
  onOpenUpdate: noOp,
  onContinueAfterConnection: noOp,
  onSkipConnection: noOp,
  onStartProjectSetup: noOp,
  onSkipProjectSetup: noOp,
  onContinueWithoutProject: noOp
} satisfies OnboardingScreenProps

function activationFixture(
  activation: LicenseActivationStatus | null,
  overrides: Partial<OnboardingScreenProps> = {}
): OnboardingScreenProps {
  return {
    ...baseOnboardingFixture,
    step: 'activation',
    activation,
    ...overrides
  }
}

function repositorySetupContent(
  overrides: Partial<RepositorySetupViewProps> = {}
): React.JSX.Element {
  return (
    <RepositorySetupView
      options={repositoryOptionsFixture}
      searchQuery=""
      selectedRepositoryId="repository-1"
      selectedExistingProjectId={null}
      progress={null}
      error={null}
      isStarting={false}
      agentResourcesTrusted={false}
      onSearchQueryChange={noOp}
      onSelectRepository={noOp}
      onSelectExistingProject={noOp}
      onAgentResourcesTrustedChange={noOp}
      onStart={noOp}
      onCancel={noOp}
      onConfigureAccess={noOp}
      {...overrides}
    />
  )
}

export const welcomeOnboardingFixture = {
  ...baseOnboardingFixture
} satisfies OnboardingScreenProps

export const licenseLoadingOnboardingFixture = activationFixture(null)

export const licenseRequiredOnboardingFixture = activationFixture({
  mode: 'required',
  state: 'inactive',
  canEnterWorkspace: false,
  message: 'Enter a license key to activate Space Zero.'
})

export const invalidLicenseOnboardingFixture = activationFixture({
  mode: 'required',
  state: 'invalid',
  canEnterWorkspace: false,
  message: 'This license key is invalid. Check the key and try again.'
})

export const expiredLicenseOnboardingFixture = activationFixture({
  mode: 'required',
  state: 'expired',
  canEnterWorkspace: false,
  message: 'This license is expired. Renew or reactivate to continue.',
  renewalUrl: 'https://spacezero.dev/renew'
})

export const offlineGraceOnboardingFixture = activationFixture({
  mode: 'required',
  state: 'grace-period',
  canEnterWorkspace: true,
  message: 'Offline access is available during the 7-day grace period.',
  graceEndsAt: '2026-08-21T12:00:00.000Z',
  recheckAfter: '2026-08-15T12:00:00.000Z'
})

export const unsupportedVersionOnboardingFixture = activationFixture({
  mode: 'required',
  state: 'unsupported-version',
  canEnterWorkspace: false,
  message: 'This Space Zero build is no longer supported. Update to continue.',
  updateUrl: 'https://spacezero.dev/download'
})

export const activatingOnboardingFixture = activationFixture(
  {
    mode: 'required',
    state: 'inactive',
    canEnterWorkspace: false,
    message: 'Enter a license key to activate Space Zero.'
  },
  { licenseKey: 'SZ-BETA-1234', isActivating: true }
)

export const activationErrorOnboardingFixture = activationFixture(
  {
    mode: 'required',
    state: 'inactive',
    canEnterWorkspace: false,
    message: 'Enter a license key to activate Space Zero.'
  },
  { error: 'Unable to activate Space Zero. Check your connection and retry.' }
)

export const githubDisconnectedOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'connection',
  connectionContent: <GitHubAccountSettingsScreen {...disconnectedGitHubAccountFixture} />
} satisfies OnboardingScreenProps

export const githubConnectedOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'connection',
  connectionContent: <GitHubAccountSettingsScreen {...connectedGitHubAccountFixture} />
} satisfies OnboardingScreenProps

export const githubErrorOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'connection',
  connectionContent: <GitHubAccountSettingsScreen {...errorGitHubAccountFixture} />
} satisfies OnboardingScreenProps

export const projectSetupOfferOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'project-offer'
} satisfies OnboardingScreenProps

export const projectSetupBusyOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'project-setup',
  isProjectSetupBusy: true,
  projectSetupContent: repositorySetupContent({
    progress: {
      operationId: 'clone-1',
      status: 'cloning',
      message: 'Cloning repository…',
      percent: 64
    }
  })
} satisfies OnboardingScreenProps

export const projectSetupErrorOnboardingFixture = {
  ...baseOnboardingFixture,
  step: 'project-setup',
  projectSetupContent: repositorySetupContent({
    progress: {
      operationId: 'clone-1',
      status: 'failed',
      message: 'Clone failed before the repository could be added.'
    },
    error: 'Unable to start the clone. Check repository access and destination, then retry.'
  })
} satisfies OnboardingScreenProps
