import { WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

import type { ApplyDownloadedUpdateResult, UpdateActiveWorkSummary, UpdateStatus } from '../shared'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'

type UpdateRestartControlProps = {
  placement: 'sidebar' | 'settings'
}

export function UpdateRestartControl({ placement }: UpdateRestartControlProps): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeWork, setActiveWork] = useState<UpdateActiveWorkSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    let isCurrent = true
    const unsubscribe = window.spacezero.update.onStatusChange((nextStatus) => {
      if (!isCurrent) return
      setStatus(nextStatus)
    })

    window.spacezero.update
      .getStatus()
      .then((nextStatus) => {
        if (!isCurrent) return
        setStatus(nextStatus)
      })
      .catch(() => undefined)

    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  if (status?.state !== 'update-downloaded') return null

  async function requestApply(confirmActiveWork: boolean): Promise<void> {
    setError(null)
    setIsApplying(true)
    try {
      const result = await window.spacezero.update.applyDownloadedUpdate({ confirmActiveWork })
      handleApplyResult(result)
    } catch {
      setError('Could not apply the downloaded update. Try again from Settings/About.')
    } finally {
      setIsApplying(false)
    }
  }

  function handleApplyResult(result: ApplyDownloadedUpdateResult): void {
    if (result.status === 'needs-confirmation') {
      setActiveWork(result.activeWork)
      setDialogOpen(true)
      return
    }
    if (result.status === 'no-downloaded-update') {
      setDialogOpen(false)
      setStatus(result.updateStatus)
    }
  }

  const version = status.downloadedVersion ?? status.availableVersion ?? 'the latest version'
  const isSidebar = placement === 'sidebar'

  return (
    <>
      <Button
        type="button"
        variant={isSidebar ? 'secondary' : 'default'}
        size={isSidebar ? 'sm' : 'default'}
        className={cn(
          isSidebar &&
            'w-full justify-start border border-amber-300 bg-amber-100 text-amber-950 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900'
        )}
        onClick={() => void requestApply(false)}
        disabled={isApplying}
        aria-label={isSidebar ? 'Restart to update Space Zero' : undefined}
      >
        <WarningCircle className="h-4 w-4" aria-hidden="true" />
        <span>{isSidebar ? 'Update ready' : `Restart to update to ${version}`}</span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby="update-restart-description">
          <DialogHeader>
            <DialogTitle>Restart and apply update?</DialogTitle>
            <DialogDescription id="update-restart-description">
              Space Zero downloaded {version}. Restarting now will stop active work in this window.
            </DialogDescription>
          </DialogHeader>

          {activeWork && hasActiveWork(activeWork) ? (
            <Alert>
              <AlertDescription>
                Active work warning: {formatActiveWork(activeWork)}. You can cancel and keep working, or restart anyway.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void requestApply(true)}
              disabled={isApplying}
              aria-label="Restart and apply update"
            >
              Restart and apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function hasActiveWork(activeWork: UpdateActiveWorkSummary): boolean {
  return activeWork.projectSessions > 0 || activeWork.chatContexts > 0 || activeWork.terminalTabs > 0
}

function formatActiveWork(activeWork: UpdateActiveWorkSummary): string {
  const parts = [
    formatCount(activeWork.projectSessions, 'Project Session'),
    formatCount(activeWork.chatContexts, 'Chat Context'),
    formatCount(activeWork.terminalTabs, 'Terminal tab')
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'no active sessions or terminals'
}

function formatCount(count: number, label: string): string | null {
  if (count === 0) return null
  return `${count} active ${label}${count === 1 ? '' : 's'}`
}
