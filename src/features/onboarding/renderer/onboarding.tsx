import { useEffect, useState } from 'react'
import { Key, RocketLaunch } from '@phosphor-icons/react'

import type { LicenseActivationStatus } from '../../license-activation/shared'
import { AccountSettings, RepositorySetup } from '../../github/renderer'
import { requestProjectOpen } from '../../projects/renderer/project-open-request'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

type OnboardingStep = 'welcome' | 'activation' | 'connection' | 'project-offer' | 'project-setup'

export function Onboarding({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [activation, setActivation] = useState<LicenseActivationStatus | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [isProjectSetupBusy, setIsProjectSetupBusy] = useState(false)

  useEffect(() => {
    async function loadActivation(): Promise<void> {
      try {
        setActivation(await window.spacezero.licenseActivation.getStatus())
      } catch {
        setActivation(null)
      }
    }
    void loadActivation()
  }, [])

  async function finish(projectId?: string): Promise<void> {
    setIsFinishing(true)
    setError(null)
    try {
      await window.spacezero.onboarding.complete()
      if (projectId) requestProjectOpen(projectId)
      onComplete()
    } catch {
      setError('Activate Space Zero before completing onboarding.')
    } finally {
      setIsFinishing(false)
    }
  }

  async function continueToActivation(): Promise<void> {
    setError(null)
    try {
      const status = await window.spacezero.licenseActivation.getStatus()
      setActivation(status)
      if (status.canEnterWorkspace) {
        await startConnection()
        return
      }
      setStep('activation')
    } catch {
      setError('Unable to load License Activation. Retry before continuing.')
    }
  }

  async function activate(): Promise<void> {
    setIsActivating(true)
    setError(null)
    try {
      const status = await window.spacezero.licenseActivation.activate({ licenseKey })
      setActivation(status)
      if (!status.canEnterWorkspace) {
        setError(status.message)
        return
      }
      await startConnection()
    } catch {
      setError('Unable to activate Space Zero. Check your connection and retry.')
    } finally {
      setIsActivating(false)
    }
  }

  async function openExternalStatusUrl(url: string): Promise<void> {
    try {
      await window.spacezero.browser.openUrlInDefaultBrowser({ url })
    } catch {
      setError('Unable to open this link. Copy it from your license email and try again.')
    }
  }

  async function startConnection(): Promise<void> {
    setError(null)
    try {
      const connection = await window.spacezero.github.getConnection()
      setStep(connection.status === 'connected' ? 'project-offer' : 'connection')
    } catch {
      setStep('connection')
    }
  }

  async function continueAfterConnection(): Promise<void> {
    setError(null)
    try {
      const connection = await window.spacezero.github.getConnection()
      if (connection.status !== 'connected') {
        setError('Finish GitHub repository access, retry, or skip for now.')
        return
      }
      setStep('project-offer')
    } catch {
      setError('Unable to verify GitHub access. Retry or skip for now.')
    }
  }

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
            <Button onClick={() => void continueToActivation()}>Get started</Button>
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
            {activation?.mode === 'development-bypass' ? (
              <div className="rounded-md border bg-muted/40 p-4 text-sm">
                {activation.message}
              </div>
            ) : (
              <>
                {activation && !error ? <p className="text-sm text-muted-foreground">{activation.message}</p> : null}
                <Input
                  aria-label="License key"
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  placeholder="Enter your license key"
                />
              </>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button disabled={isActivating} onClick={() => void activate()}>
                {activation?.mode === 'development-bypass' ? 'Continue with development bypass' : 'Activate'}
              </Button>
              {renewalUrl ? (
                <Button variant="outline" onClick={() => void openExternalStatusUrl(renewalUrl)}>
                  Renew or reactivate
                </Button>
              ) : null}
              {updateUrl ? (
                <Button variant="outline" onClick={() => void openExternalStatusUrl(updateUrl)}>
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
            <AccountSettings />
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button onClick={() => void continueAfterConnection()}>Continue</Button>
              <Button variant="outline" disabled={isFinishing} onClick={() => void finish()}>
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
              <Button onClick={() => setStep('project-setup')}>Set up a Project</Button>
              <Button variant="outline" disabled={isFinishing} onClick={() => void finish()}>
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
            <RepositorySetup
              onProjectReady={(projectId) => finish(projectId)}
              onBusyChange={setIsProjectSetupBusy}
            />
            <Button
              variant="outline"
              disabled={isFinishing || isProjectSetupBusy}
              onClick={() => void finish()}
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
