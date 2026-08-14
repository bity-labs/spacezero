import { useEffect, useState } from 'react'

import type { ApplyDownloadedUpdateResult, UpdateActiveWorkSummary, UpdateStatus } from '../shared'
import { NotificationIconButton } from '@renderer/components/notification-icon-button'
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

type UpdateRestartControlProps = {
  placement: 'sidebar' | 'settings'
}

export type UpdateRestartControlViewProps = {
  placement: 'sidebar' | 'settings'
  version: string
  isApplying: boolean
  dialogOpen: boolean
  activeWork: UpdateActiveWorkSummary | null
  error: string | null
  onRequestApply: (confirmActiveWork: boolean) => void
  onDialogOpenChange: (open: boolean) => void
}

export function UpdateRestartControl({
  placement
}: UpdateRestartControlProps): React.JSX.Element | null {
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

  return (
    <UpdateRestartControlView
      placement={placement}
      version={status.downloadedVersion ?? status.availableVersion ?? 'the latest version'}
      isApplying={isApplying}
      dialogOpen={dialogOpen}
      activeWork={activeWork}
      error={error}
      onRequestApply={(confirmActiveWork) => void requestApply(confirmActiveWork)}
      onDialogOpenChange={setDialogOpen}
    />
  )
}

export function UpdateRestartControlView({
  placement,
  version,
  isApplying,
  dialogOpen,
  activeWork,
  error,
  onRequestApply,
  onDialogOpenChange
}: UpdateRestartControlViewProps): React.JSX.Element {
  const isSidebar = placement === 'sidebar'

  const restartButton = isSidebar ? (
    <NotificationIconButton
      label={`Update ready. Restart to update to ${version}`}
      tooltip={<>Update ready. Restart to update to {version}.</>}
      tone="warning"
      disabled={isApplying}
      onNotificationClick={() => onRequestApply(false)}
    />
  ) : (
    <Button
      type="button"
      variant="default"
      onClick={() => onRequestApply(false)}
      disabled={isApplying}
    >
      <span>{`Restart to update to ${version}`}</span>
    </Button>
  )

  return (
    <>
      {restartButton}

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
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
                Active work warning: {formatActiveWork(activeWork)}. You can cancel and keep
                working, or restart anyway.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => onRequestApply(true)}
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
  return (
    activeWork.projectSessions > 0 || activeWork.chatContexts > 0 || activeWork.terminalTabs > 0
  )
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
