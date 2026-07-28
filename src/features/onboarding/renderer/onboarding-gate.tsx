import { useEffect, useState } from 'react'

import type { LicenseActivationStatus } from '../../license-activation/shared'
import { Onboarding } from './onboarding'
import { Button } from '@renderer/components/ui/button'

const MIN_ACTIVATION_RECHECK_DELAY_MS = 1000

export function OnboardingGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [completed, setCompleted] = useState<boolean | null>(null)
  const [error, setError] = useState(false)
  const [blockedActivation, setBlockedActivation] = useState<LicenseActivationStatus | null>(null)
  const [nextActivationCheckAt, setNextActivationCheckAt] = useState<number | null>(null)

  async function loadStatus(): Promise<void> {
    setError(false)
    try {
      const [status, activation] = await Promise.all([
        window.spacezero.onboarding.getStatus(),
        window.spacezero.licenseActivation.getStatus()
      ])
      const canShowWorkspace = status.completed && activation.canEnterWorkspace
      setCompleted(canShowWorkspace)
      setBlockedActivation(status.completed && !activation.canEnterWorkspace ? activation : null)
      setNextActivationCheckAt(nextRecheckTime(status.completed, activation))
    } catch {
      setError(true)
      setBlockedActivation(null)
      setNextActivationCheckAt(null)
    }
  }

  useEffect(() => {
    async function load(): Promise<void> {
      await loadStatus()
    }
    void load()
  }, [])

  useEffect(() => {
    if (nextActivationCheckAt === null) return undefined
    const delay = Math.max(MIN_ACTIVATION_RECHECK_DELAY_MS, nextActivationCheckAt - Date.now())
    const timeout = window.setTimeout(() => void loadStatus(), delay)
    return () => window.clearTimeout(timeout)
  }, [nextActivationCheckAt])

  useEffect(() => {
    if (completed === false) window.history.replaceState(null, '', '#/onboarding')
    if (completed === true && window.location.hash === '#/onboarding') {
      window.history.replaceState(null, '', '#/')
    }
  }, [completed])

  if (error) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-background p-6"
        aria-label="Space Zero onboarding"
      >
        <div className="text-center">
          <p className="text-sm text-destructive">Unable to load onboarding state.</p>
          <Button className="mt-4" onClick={() => void loadStatus()}>
            Retry
          </Button>
        </div>
      </main>
    )
  }

  if (completed === null) {
    return <main className="min-h-screen bg-background" aria-label="Loading Space Zero" />
  }

  if (!completed) {
    return <Onboarding initialActivationStatus={blockedActivation ?? undefined} onComplete={() => setCompleted(true)} />
  }
  return <>{children}</>
}

function nextRecheckTime(onboardingCompleted: boolean, activation: LicenseActivationStatus): number | null {
  if (!onboardingCompleted || !activation.canEnterWorkspace || !activation.recheckAfter) return null
  const recheckAfter = Date.parse(activation.recheckAfter)
  return Number.isFinite(recheckAfter) ? recheckAfter + 1 : null
}
