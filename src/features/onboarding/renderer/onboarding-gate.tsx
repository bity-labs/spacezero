import { useEffect, useState } from 'react'

import { Onboarding } from './onboarding'
import { Button } from '@renderer/components/ui/button'

export function OnboardingGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [completed, setCompleted] = useState<boolean | null>(null)
  const [error, setError] = useState(false)

  async function loadStatus(): Promise<void> {
    setError(false)
    try {
      const status = await window.spacezero.onboarding.getStatus()
      setCompleted(status.completed)
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    async function load(): Promise<void> {
      await loadStatus()
    }
    void load()
  }, [])

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

  if (!completed) return <Onboarding onComplete={() => setCompleted(true)} />
  return <>{children}</>
}
