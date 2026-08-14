import { useEffect, useState } from 'react'

import type { LicenseActivationStatus } from '../../license-activation/shared'
import type { OnboardingStatus } from '../shared'
import { AccountSettings, RepositorySetup } from '../../github/renderer'
import { requestProjectOpen } from '../../projects/renderer/project-open-request'
import { OnboardingScreen, type OnboardingScreenStep } from './onboarding-screen'

export function Onboarding({
  initialActivationStatus,
  onComplete
}: {
  initialActivationStatus?: LicenseActivationStatus
  onComplete: (status: OnboardingStatus) => void
}): React.JSX.Element {
  const [step, setStep] = useState<OnboardingScreenStep>(
    initialActivationStatus ? 'activation' : 'welcome'
  )
  const [activation, setActivation] = useState<LicenseActivationStatus | null>(
    initialActivationStatus ?? null
  )
  const [licenseKey, setLicenseKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isActivating, setIsActivating] = useState(false)
  const [isProjectSetupBusy, setIsProjectSetupBusy] = useState(false)

  useEffect(() => {
    if (initialActivationStatus) return

    async function loadActivation(): Promise<void> {
      try {
        setActivation(await window.spacezero.licenseActivation.getStatus())
      } catch {
        setActivation(null)
      }
    }
    void loadActivation()
  }, [initialActivationStatus])

  async function finish(projectId?: string): Promise<void> {
    setIsFinishing(true)
    setError(null)
    try {
      const status = await window.spacezero.onboarding.complete()
      if (projectId) requestProjectOpen(projectId)
      onComplete(status)
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

  return (
    <OnboardingScreen
      step={step}
      activation={activation}
      licenseKey={licenseKey}
      error={error}
      isFinishing={isFinishing}
      isActivating={isActivating}
      isProjectSetupBusy={isProjectSetupBusy}
      connectionContent={<AccountSettings />}
      projectSetupContent={
        <RepositorySetup
          onProjectReady={(projectId) => finish(projectId)}
          onBusyChange={setIsProjectSetupBusy}
        />
      }
      onGetStarted={() => void continueToActivation()}
      onLicenseKeyChange={setLicenseKey}
      onActivate={() => void activate()}
      onOpenRenewal={() => {
        if (activation?.renewalUrl) void openExternalStatusUrl(activation.renewalUrl)
      }}
      onOpenUpdate={() => {
        if (activation?.updateUrl) void openExternalStatusUrl(activation.updateUrl)
      }}
      onContinueAfterConnection={() => void continueAfterConnection()}
      onSkipConnection={() => void finish()}
      onStartProjectSetup={() => setStep('project-setup')}
      onSkipProjectSetup={() => void finish()}
      onContinueWithoutProject={() => void finish()}
    />
  )
}
