import type { ReactNode } from 'react'
import { Key, RocketLaunch } from '@phosphor-icons/react'

import type { LicenseActivationStatus } from '../../license-activation/shared'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

export type OnboardingScreenStep =
  'welcome' | 'activation' | 'connection' | 'project-offer' | 'project-setup'

export type OnboardingScreenProps = {
  step: OnboardingScreenStep
  activation: LicenseActivationStatus | null
  licenseKey: string
  error: string | null
  isFinishing: boolean
  isActivating: boolean
  isProjectSetupBusy: boolean
  connectionContent: ReactNode
  projectSetupContent: ReactNode
  onGetStarted: () => void
  onLicenseKeyChange: (licenseKey: string) => void
  onActivate: () => void
  onOpenRenewal: () => void
  onOpenUpdate: () => void
  onContinueAfterConnection: () => void
  onSkipConnection: () => void
  onStartProjectSetup: () => void
  onSkipProjectSetup: () => void
  onContinueWithoutProject: () => void
}

export function OnboardingScreen({
  step,
  activation,
  licenseKey,
  error,
  isFinishing,
  isActivating,
  isProjectSetupBusy,
  connectionContent,
  projectSetupContent,
  onGetStarted,
  onLicenseKeyChange,
  onActivate,
  onOpenRenewal,
  onOpenUpdate,
  onContinueAfterConnection,
  onSkipConnection,
  onStartProjectSetup,
  onSkipProjectSetup,
  onContinueWithoutProject
}: OnboardingScreenProps): React.JSX.Element {
  const renewalUrl = activation?.renewalUrl
  const updateUrl = activation?.updateUrl

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background p-6"
      aria-label="Space Zero onboarding"
    >
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <RocketLaunch className="size-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-3xl font-semibold">Welcome to Space Zero</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Keep Projects, Sessions, GitHub work, and agents in one local-first desktop workspace.
          </p>
        </div>

        {step === 'welcome' ? (
          <Card className="items-center gap-5 p-8 text-center">
            <div>
              <h2 className="text-lg font-medium">Activate Space Zero</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                First activate your license, then connect GitHub and optionally set up a Project.
              </p>
            </div>
            <Button onClick={onGetStarted}>Get started</Button>
          </Card>
        ) : step === 'activation' ? (
          <Card className="gap-5 p-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-medium">
                <Key className="size-5" aria-hidden="true" />
                License Activation
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Public builds require a valid license before entering the workspace.
              </p>
            </div>
            {!activation ? (
              <div className="space-y-3" role="status" aria-label="Loading License Activation">
                <span className="sr-only">Loading License Activation</span>
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              </div>
            ) : activation.mode === 'development-bypass' ? (
              <div className="rounded-md border bg-muted/40 p-4 text-sm">{activation.message}</div>
            ) : (
              <>
                {!error ? (
                  <p className="text-sm text-muted-foreground">{activation.message}</p>
                ) : null}
                <Input
                  aria-label="License key"
                  value={licenseKey}
                  onChange={(event) => onLicenseKeyChange(event.target.value)}
                  placeholder="Enter your license key"
                />
              </>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button disabled={!activation || isActivating} onClick={onActivate}>
                {isActivating
                  ? 'Activating…'
                  : activation?.mode === 'development-bypass'
                    ? 'Continue with development bypass'
                    : 'Activate'}
              </Button>
              {renewalUrl ? (
                <Button variant="outline" onClick={onOpenRenewal}>
                  Renew or reactivate
                </Button>
              ) : null}
              {updateUrl ? (
                <Button variant="outline" onClick={onOpenUpdate}>
                  Update Space Zero
                </Button>
              ) : null}
            </div>
          </Card>
        ) : step === 'connection' ? (
          <Card className="gap-5 p-6">
            <div>
              <h2 className="text-lg font-medium">Connect GitHub</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Authorize your identity, then install the GitHub App for at least one repository.
              </p>
            </div>
            {connectionContent}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={onContinueAfterConnection}>Continue</Button>
              <Button variant="outline" disabled={isFinishing} onClick={onSkipConnection}>
                Skip for now
              </Button>
            </div>
          </Card>
        ) : step === 'project-offer' ? (
          <Card className="items-center gap-5 p-8 text-center">
            <div>
              <h2 className="text-lg font-medium">Set up a GitHub Project?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose one authorized repository to open an existing Project or clone it into Space
                Zero Home. No agent Session starts automatically.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={onStartProjectSetup}>Set up a Project</Button>
              <Button variant="outline" disabled={isFinishing} onClick={onSkipProjectSetup}>
                Skip Project setup
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="gap-5 p-6">
            <div>
              <h2 className="text-lg font-medium">Choose one GitHub repository</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Clone progress appears here. You can retry, choose another repository, or continue
                without a Project.
              </p>
            </div>
            {projectSetupContent}
            <Button
              variant="outline"
              disabled={isFinishing || isProjectSetupBusy}
              onClick={onContinueWithoutProject}
            >
              Continue without a Project
            </Button>
          </Card>
        )}

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </div>
    </main>
  )
}
