import { useState } from 'react'
import { GithubLogo, RocketLaunch } from '@phosphor-icons/react'

import { AccountSettings, RepositorySetup } from '../../github/renderer'
import { requestProjectOpen } from '../../projects/renderer/project-open-request'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'

type OnboardingStep = 'welcome' | 'connection' | 'project-offer' | 'project-setup'

export function Onboarding({ onComplete }: { onComplete: () => void }): React.JSX.Element {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [error, setError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)

  async function finish(projectId?: string): Promise<void> {
    setIsFinishing(true)
    setError(null)
    try {
      await window.spacezero.onboarding.complete()
      if (projectId) requestProjectOpen(projectId)
      onComplete()
    } catch {
      setError('Unable to save onboarding completion. Retry or continue locally later.')
    } finally {
      setIsFinishing(false)
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
              <h2 className="text-lg font-medium">Connect GitHub (optional)</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse repositories, Issues, and Pull Requests. You can skip and use local Projects
                without a Space Zero account.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="gap-2" onClick={() => void startConnection()}>
                <GithubLogo className="size-4" aria-hidden="true" />
                Connect GitHub
              </Button>
              <Button variant="outline" disabled={isFinishing} onClick={() => void finish()}>
                Skip
              </Button>
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
            <RepositorySetup onProjectReady={(projectId) => finish(projectId)} />
            <Button variant="outline" disabled={isFinishing} onClick={() => void finish()}>
              Continue without a Project
            </Button>
          </Card>
        )}

        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </div>
    </main>
  )
}
